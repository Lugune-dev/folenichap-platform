package tz.co.folenichap.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Fails fast on configuration that would leave the platform open: fake payments in production,
 * guessable webhook secrets, or missing gateway credentials. Better a refused start than a bypass.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SecurityStartupCheck implements InitializingBean {

    private static final int MIN_WEBHOOK_SECRET = 32;

    private final AppProperties props;

    @Override
    public void afterPropertiesSet() {
        List<String> problems = new ArrayList<>();
        AppProperties.Payment pay = props.payment();
        String gateway = pay.gateway() == null ? "" : pay.gateway().trim().toUpperCase(Locale.ROOT);

        switch (gateway) {
            case "MOCK" -> {
                if (!pay.allowMock()) {
                    problems.add("PAYMENT_GATEWAY=MOCK approves every payment automatically. Set ALLOW_MOCK_PAYMENTS=true "
                            + "for development only, or configure PAYMENT_GATEWAY=AZAMPAY.");
                } else {
                    log.warn("*** MOCK payment gateway is active: payments are simulated and auto-approved. "
                            + "Never run this in production. ***");
                }
            }
            case "AZAMPAY" -> {
                String secret = pay.webhookSecret();
                if (secret == null || secret.length() < MIN_WEBHOOK_SECRET || secret.equalsIgnoreCase("change-me")) {
                    problems.add("PAYMENT_WEBHOOK_SECRET must be at least " + MIN_WEBHOOK_SECRET
                            + " random characters (openssl rand -hex 24).");
                }
                AppProperties.AzamPay az = pay.azampay();
                if (az == null || blank(az.appName()) || blank(az.clientId()) || blank(az.clientSecret()) || blank(az.apiKey())) {
                    problems.add("AZAMPAY_APP_NAME, AZAMPAY_CLIENT_ID, AZAMPAY_CLIENT_SECRET and AZAMPAY_API_KEY are required.");
                } else if (az.checkoutUrl() != null && az.checkoutUrl().contains("sandbox")) {
                    log.warn("AzamPay SANDBOX is active: no real money moves.");
                }
                if (pay.webhookAllowedIps() == null || pay.webhookAllowedIps().stream().allMatch(String::isBlank)) {
                    log.warn("PAYMENT_WEBHOOK_ALLOWED_IPS is empty: payment callbacks are accepted from any IP "
                            + "that knows the webhook secret. Add AzamPay's callback IPs for production.");
                }
            }
            default -> problems.add("Unknown PAYMENT_GATEWAY '" + pay.gateway() + "' (use MOCK or AZAMPAY).");
        }

        if (props.security().accessTokenMinutes() > 60) {
            problems.add("JWT_ACCESS_MINUTES must be 60 or less.");
        }
        if (!props.security().refreshCookieSecure() && props.publicBaseUrl() != null
                && props.publicBaseUrl().startsWith("https://") && !props.publicBaseUrl().contains("localhost")) {
            problems.add("REFRESH_COOKIE_SECURE=false is not allowed when PUBLIC_BASE_URL is a public https site.");
        }

        if (!problems.isEmpty()) {
            throw new IllegalStateException("Insecure configuration, refusing to start:\n - " + String.join("\n - ", problems));
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
