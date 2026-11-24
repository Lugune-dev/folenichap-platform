package tz.co.folenichap;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tz.co.folenichap.security.TrustedProxyFilter;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TrustedProxyFilterTest {

    private static final String SECRET = "0123456789abcdef0123456789abcdef0123";

    /** Runs the filter and returns the remote address the application saw (null if the chain was not reached). */
    private static String[] run(TrustedProxyFilter filter, MockHttpServletRequest req) throws Exception {
        AtomicReference<String> seen = new AtomicReference<>();
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, new MockFilterChain() {
            @Override
            public void doFilter(jakarta.servlet.ServletRequest r, jakarta.servlet.ServletResponse s) {
                seen.set(((HttpServletRequest) r).getRemoteAddr());
            }
        });
        return new String[] { String.valueOf(res.getStatus()), seen.get() };
    }

    private static MockHttpServletRequest request(String path) {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", path);
        req.setRemoteAddr("76.76.21.9"); // the proxy's own address
        return req;
    }

    @Test
    void disabledWhenNoSecret() throws Exception {
        String[] r = run(new TrustedProxyFilter(""), request("/api/v1/public/x"));
        assertThat(r[0]).isEqualTo("200");
        assertThat(r[1]).isEqualTo("76.76.21.9");
    }

    @Test
    void rejectsDirectCallsWithoutTheSecret() throws Exception {
        MockHttpServletRequest req = request("/api/v1/auth/login");
        req.addHeader("X-Client-IP", "1.2.3.4"); // a spoofed IP must not help without the secret
        String[] r = run(new TrustedProxyFilter(SECRET), req);
        assertThat(r[0]).isEqualTo("403");
        assertThat(r[1]).isNull();
    }

    @Test
    void rejectsWrongSecret() throws Exception {
        MockHttpServletRequest req = request("/api/v1/auth/login");
        req.addHeader("X-Proxy-Secret", SECRET + "x");
        assertThat(run(new TrustedProxyFilter(SECRET), req)[0]).isEqualTo("403");
    }

    @Test
    void usesClientIpFromTheProxy() throws Exception {
        MockHttpServletRequest req = request("/api/v1/auth/login");
        req.addHeader("X-Proxy-Secret", SECRET);
        req.addHeader("X-Client-IP", "41.59.10.20");
        String[] r = run(new TrustedProxyFilter(SECRET), req);
        assertThat(r[0]).isEqualTo("200");
        assertThat(r[1]).isEqualTo("41.59.10.20");
    }

    @Test
    void ignoresMalformedClientIp() throws Exception {
        MockHttpServletRequest req = request("/api/v1/auth/login");
        req.addHeader("X-Proxy-Secret", SECRET);
        req.addHeader("X-Client-IP", "<script>");
        assertThat(run(new TrustedProxyFilter(SECRET), req)[1]).isEqualTo("76.76.21.9");
    }

    @Test
    void healthCheckNeedsNoSecret() throws Exception {
        assertThat(run(new TrustedProxyFilter(SECRET), request("/actuator/health"))[0]).isEqualTo("200");
        assertThat(run(new TrustedProxyFilter(SECRET), request("/actuator/health/readiness"))[0]).isEqualTo("200");
    }

    @Test
    void refusesAWeakSecret() {
        assertThatThrownBy(() -> new TrustedProxyFilter("short")).isInstanceOf(IllegalStateException.class);
    }
}
