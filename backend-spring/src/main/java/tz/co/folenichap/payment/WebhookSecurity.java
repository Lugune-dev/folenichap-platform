package tz.co.folenichap.payment;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tz.co.folenichap.config.AppProperties;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;

/**
 * Webhook authentication. A callback is accepted when:
 * <ul>
 *   <li>its HMAC-SHA256 signature header (hex or base64 of the raw body) matches, OR</li>
 *   <li>the secret callback token in the URL matches (for gateways that do not sign), AND</li>
 *   <li>the caller IP is in the allow-list (when one is configured).</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
public class WebhookSecurity {

    private final AppProperties props;

    public boolean ipAllowed(String ip) {
        List<String> allowed = props.payment().webhookAllowedIps();
        if (allowed == null || allowed.isEmpty() || (allowed.size() == 1 && allowed.get(0).isBlank())) {
            return true;
        }
        return ip != null && allowed.stream().map(String::trim).anyMatch(ip::equals);
    }

    public boolean authentic(String rawBody, String signatureHeader, String urlToken) {
        String secret = props.payment().webhookSecret();
        if (secret == null || secret.isBlank()) {
            return false;
        }
        if (urlToken != null && constantTimeEquals(urlToken, secret)) {
            return true;
        }
        if (signatureHeader == null || signatureHeader.isBlank()) {
            return false;
        }
        byte[] expected = hmac(secret, rawBody);
        String sig = signatureHeader.startsWith("sha256=") ? signatureHeader.substring(7) : signatureHeader;
        return constantTimeEquals(sig.toLowerCase(), HexFormat.of().formatHex(expected))
                || constantTimeEquals(sig, java.util.Base64.getEncoder().encodeToString(expected));
    }

    static byte[] hmac(String secret, String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
