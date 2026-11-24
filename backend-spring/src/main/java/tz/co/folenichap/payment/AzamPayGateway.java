package tz.co.folenichap.payment;

import org.springframework.http.client.SimpleClientHttpRequestFactory;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tz.co.folenichap.config.AppProperties;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/**
 * AzamPay MNO checkout: one integration that pushes USSD prompts on M-Pesa, Mixx by Yas (Tigo),
 * Airtel Money, HaloPesa and AzamPesa. Register {@code https://<your-domain>/api/v1/webhooks/payments/azampay?token=<PAYMENT_WEBHOOK_SECRET>}
 * as the callback URL in the AzamPay merchant portal.
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
        this.auth = builder.clone().requestFactory(http).baseUrl(cfg.authUrl()).build();
        this.checkout = builder.clone().requestFactory(http).baseUrl(cfg.checkoutUrl()).build();
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
                        h.set("X-API-Key", cfg.apiKey());
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
            return new StkPushResult(ok, res == null ? null : res.path("transactionId").asText(null),
                    res == null ? "No response" : res.path("message").asText(""));
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
        JsonNode res = auth.post()
                .uri("/AppRegistration/GenerateToken")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("appName", cfg.appName(), "clientId", cfg.clientId(), "clientSecret", cfg.clientSecret()))
                .retrieve()
                .body(JsonNode.class);
        String t = res == null ? null : res.path("data").path("accessToken").asText(null);
        if (t == null) {
            throw new IllegalStateException("AzamPay authentication failed");
        }
        token = t;
        tokenExpiry = Instant.now().plus(Duration.ofMinutes(50)); // tokens are valid ~1h; refresh early
        return t;
    }
}
