package tz.co.folenichap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;
import java.util.List;

/**
 * Strongly typed view of the {@code foleni.*} configuration tree.
 */
@ConfigurationProperties(prefix = "foleni")
public record AppProperties(
        String publicBaseUrl,
        Cors cors,
        Security security,
        Bootstrap bootstrap,
        int trialDays,
        boolean requireTenantApproval,
        Plans plans,
        Sse sse,
        RateLimit rateLimit,
        Payment payment,
        Notification notification) {

    public record Cors(List<String> allowedOrigins) {}

    public record Security(String jwtSecret, int accessTokenMinutes, int refreshTokenDays, boolean refreshCookieSecure,
                           boolean apiDocsEnabled) {}

    public record Bootstrap(String superAdminEmail, String superAdminPassword, String superAdminName) {}

    public record Plans(BigDecimal starterPrice, BigDecimal proPrice, int proMonthlyCredits) {}

    public record Sse(boolean redisRelay, int heartbeatSeconds, int timeoutMinutes) {}

    public record RateLimit(int publicTicketsPerMinute) {}

    public record Payment(String gateway,
                          boolean allowMock,
                          String webhookSecret,
                          String webhookSignatureHeader,
                          List<String> webhookAllowedIps,
                          int mockSuccessDelaySeconds,
                          AzamPay azampay) {}

    public record AzamPay(String appName, String clientId, String clientSecret, String apiKey,
                          String authUrl, String checkoutUrl) {}

    public record Notification(int nearTurnPosition, WhatsApp whatsapp, Sms sms) {}

    public record WhatsApp(boolean enabled, String apiVersion, String phoneNumberId, String accessToken,
                           String templateBooked, String templateNearTurn, String templateCalled,
                           String templateAppointmentBooked, String templateAppointmentReminder,
                           String templatePasswordReset) {}

    public record Sms(boolean enabled, String provider, String beemApiKey, String beemSecretKey, String senderId) {}
}
