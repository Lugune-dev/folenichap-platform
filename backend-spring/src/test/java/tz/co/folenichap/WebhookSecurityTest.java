package tz.co.folenichap;

import org.junit.jupiter.api.Test;
import tz.co.folenichap.config.AppProperties;
import tz.co.folenichap.payment.WebhookSecurity;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class WebhookSecurityTest {

    private static final String SECRET = "s3cret-webhook-key";

    private WebhookSecurity security(List<String> ips) {
        var payment = new AppProperties.Payment("MOCK", true, SECRET, "X-Signature", ips, 1, null);
        var props = new AppProperties(null, null, null, null, 14, false, null, null, null, payment, null);
        return new WebhookSecurity(props);
    }

    @Test
    void acceptsValidHexSignature() throws Exception {
        String body = "{\"utilityref\":\"BF-1\",\"transactionstatus\":\"success\"}";
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String sig = HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        assertThat(security(List.of()).authentic(body, "sha256=" + sig, null)).isTrue();
        assertThat(security(List.of()).authentic(body + " ", sig, null)).isFalse();
    }

    @Test
    void acceptsUrlToken() {
        assertThat(security(List.of()).authentic("{}", null, SECRET)).isTrue();
        assertThat(security(List.of()).authentic("{}", null, "wrong")).isFalse();
    }

    @Test
    void enforcesIpAllowList() {
        WebhookSecurity s = security(List.of("41.59.1.1", "41.59.1.2"));
        assertThat(s.ipAllowed("41.59.1.2")).isTrue();
        assertThat(s.ipAllowed("8.8.8.8")).isFalse();
        assertThat(security(List.of()).ipAllowed("8.8.8.8")).isTrue();
    }
}
