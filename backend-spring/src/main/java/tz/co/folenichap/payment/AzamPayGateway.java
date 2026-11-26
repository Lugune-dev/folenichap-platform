package tz.co.folenichap.payment;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tz.co.folenichap.config.AppProperties;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Map;

/**
 * AzamPay MNO checkout: one integration that pushes USSD prompts on M-Pesa, Mixx by Yas (Tigo),
 * Airtel Money, HaloPesa and AzamPesa. Register
 * {@code https://<your-domain>/api/v1/webhooks/payments/azampay?token=<PAYMENT_WEBHOOK_SECRET>}
 * as the callback URL in the AzamPay merchant portal.
 * <p>
 * Flow: POST {auth}/AppRegistration/GenerateToken (appName, clientId, clientSecret) -> bearer token;
 * POST {checkout}/azampay/mno/checkout -> the customer gets a PIN prompt; AzamPay then calls our webhook.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "foleni.payment.gateway", havingValue = "AZAMPAY")
public class AzamPayGateway implements PaymentGateway {

    private final AppProperties.AzamPay cfg;
    private final RestClient auth;
    private final RestClient checkout;

    private volatile String token;
    private volatile Instant tokenExpiry = Instant.EPOCH;

    public AzamPayGateway(AppProperties props, RestClient.Builder builder) {
        this.cfg = props.payment().azampay();
        // never let a slow gateway tie up request threads
        SimpleClientHttpRequestFactory http = new SimpleClientHttpRequestFactory();
        http.setConnectTimeout((int) Duration.ofSeconds(5).toMillis());
        http.setReadTimeout((int) Duration.ofSeconds(25).toMillis());
        // Buffer bodies so requests carry Content-Length: Spring 6.2 otherwise streams them chunked,
        // which some gateway front-ends read as an empty body ("Provided detail is not valid for this app").
        BufferingClientHttpRequestFactory buffered = new BufferingClientHttpRequestFactory(http);
        this.auth = builder.clone().requestFactory(buffered).baseUrl(trim(cfg.authUrl())).build();
        this.checkout = builder.clone().requestFactory(buffered).baseUrl(trim(cfg.checkoutUrl())).build();

        boolean authSandbox = trim(cfg.authUrl()).contains("sandbox");
        boolean checkoutSandbox = trim(cfg.checkoutUrl()).contains("sandbox");
        log.info("AzamPay {}: auth={} checkout={} app={} apiKey={}", checkoutSandbox ? "SANDBOX" : "PRODUCTION",
                trim(cfg.authUrl()), trim(cfg.checkoutUrl()), trim(cfg.appName()), blank(cfg.apiKey()) ? "not set" : "set");
        if (authSandbox != checkoutSandbox) {
            log.warn("AzamPay URLs mix sandbox and production (AZAMPAY_AUTH_URL vs AZAMPAY_CHECKOUT_URL): "
                    + "tokens from one will be rejected by the other.");
        }
    }

    @Override
    public String name() {
        return "AZAMPAY";
    }

    @Override
    public StkPushResult initiate(StkPushRequest r) {
        if (r.provider().azamPayCode() == null) {
            return new StkPushResult(false, null, "Unsupported provider " + r.provider());
        }
        try {
            JsonNode res = checkout.post()
                    .uri("/azampay/mno/checkout")
                    .headers(h -> {
                        h.setBearerAuth(accessToken());
                        if (!blank(cfg.apiKey())) h.set("X-API-Key", trim(cfg.apiKey()));
                    })
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "accountNumber", r.msisdn(),
                            // TZS has no minor unit: send "5000", not "5000.00"
                            "amount", r.amount().stripTrailingZeros().toPlainString(),
                            "currency", r.currency(),
                            "externalId", r.reference(),
                            "provider", r.provider().azamPayCode(),
                            "additionalProperties", Map.of("description", r.description())))
                    .retrieve()
                    .body(JsonNode.class);
            boolean ok = res != null && res.path("success").asBoolean(false);
            String message = res == null ? "No response" : res.path("message").asText("");
            if (!ok) log.warn("AzamPay declined checkout {}: {}", r.reference(), message);
            return new StkPushResult(ok, res == null ? null : res.path("transactionId").asText(null), message);
        } catch (RestClientResponseException e) {
            // AzamPay answered with an error: log what it said so misconfiguration is visible in the logs
            log.warn("AzamPay checkout {} rejected: HTTP {} {}", r.reference(), e.getStatusCode().value(),
                    excerpt(e.getResponseBodyAsString()));
            if (e.getStatusCode().value() == 401 || e.getStatusCode().value() == 403) token = null; // re-auth next time
            return new StkPushResult(false, null, "Gateway rejected the request");
        } catch (Exception e) {
            log.warn("AzamPay checkout failed for {}: {}", r.reference(), e.getMessage());
            token = null; // force re-auth next time
            return new StkPushResult(false, null, "Gateway unavailable");
        }
    }

    private synchronized String accessToken() {
        if (token != null && Instant.now().isBefore(tokenExpiry)) {
            return token;
        }
        JsonNode res;
        try {
            res = auth.post()
                    .uri("/AppRegistration/GenerateToken")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("appName", trim(cfg.appName()), "clientId", trim(cfg.clientId()),
                            "clientSecret", trim(cfg.clientSecret())))
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException e) {
            log.error("AzamPay token request rejected: HTTP {} {} - check AZAMPAY_APP_NAME, AZAMPAY_CLIENT_ID, "
                    + "AZAMPAY_CLIENT_SECRET and that AZAMPAY_AUTH_URL matches (sandbox vs production)",
                    e.getStatusCode().value(), excerpt(e.getResponseBodyAsString()));
            throw new IllegalStateException("AzamPay authentication failed", e);
        }
        String t = res == null ? null : res.path("data").path("accessToken").asText(null);
        if (t == null) {
            log.error("AzamPay token response had no accessToken: {}", res == null ? "empty" : excerpt(res.path("message").asText("")));
            throw new IllegalStateException("AzamPay authentication failed");
        }
        token = t;
        tokenExpiry = expiry(res.path("data").path("expire").asText(null));
        return t;
    }

    /** Uses AzamPay's own expiry when given, minus a safety margin; otherwise 50 minutes. */
    private static Instant expiry(String expire) {
        Instant fallback = Instant.now().plus(Duration.ofMinutes(50));
        if (expire == null || expire.isBlank()) return fallback;
        try {
            Instant given = OffsetDateTime.parse(expire).toInstant().minus(Duration.ofMinutes(5));
            return given.isAfter(Instant.now()) ? given : fallback;
        } catch (DateTimeParseException e) {
            return fallback;
        }
    }

    private static String excerpt(String body) {
        if (body == null) return "";
        String s = body.replaceAll("\\s+", " ").trim();
        return s.length() > 300 ? s.substring(0, 300) + "..." : s;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }
}
