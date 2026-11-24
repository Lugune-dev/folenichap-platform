package tz.co.folenichap.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.regex.Pattern;

/**
 * For hosting where the API sits behind a proxy we cannot list by IP (Vercel rewriting /api/* to Render).
 * <p>
 * When {@code PROXY_SHARED_SECRET} is set:
 * <ul>
 *   <li>every request must carry {@code X-Proxy-Secret} with that value, so the backend's own public URL
 *       cannot be called directly to bypass the proxy (health checks are the only exception);</li>
 *   <li>the real client IP is taken from {@code X-Client-IP}, which the proxy fills from the address it saw.
 *       Rate limits, login lock-outs and the payment-webhook IP allow-list then work per visitor instead of
 *       treating everyone as the proxy's IP.</li>
 * </ul>
 * When the secret is empty (VPS + nginx deployment) this filter does nothing.
 */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TrustedProxyFilter extends OncePerRequestFilter {

    static final String SECRET_HEADER = "X-Proxy-Secret";
    static final String CLIENT_IP_HEADER = "X-Client-IP";
    private static final Pattern IP = Pattern.compile("^[0-9A-Fa-f:.]{2,45}$");

    private final byte[] secret;

    public TrustedProxyFilter(@Value("${foleni.proxy.shared-secret:}") String secret) {
        this.secret = secret == null || secret.isBlank() ? null : secret.trim().getBytes(StandardCharsets.UTF_8);
        if (this.secret != null && this.secret.length < 32) {
            throw new IllegalStateException("PROXY_SHARED_SECRET must be at least 32 random characters (openssl rand -hex 24).");
        }
        if (this.secret != null) {
            log.info("Trusted-proxy mode: requests must come through the proxy carrying {}", SECRET_HEADER);
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (secret == null) return true;
        String path = request.getRequestURI();
        // the hosting platform's own health probe reaches the container directly
        return path.equals("/actuator/health") || path.startsWith("/actuator/health/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String given = request.getHeader(SECRET_HEADER);
        if (given == null || !MessageDigest.isEqual(secret, given.getBytes(StandardCharsets.UTF_8))) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN);
            return;
        }
        String clientIp = request.getHeader(CLIENT_IP_HEADER);
        if (clientIp == null || !IP.matcher(clientIp.trim()).matches()) {
            chain.doFilter(request, response);
            return;
        }
        String ip = clientIp.trim();
        chain.doFilter(new HttpServletRequestWrapper(request) {
            @Override public String getRemoteAddr() { return ip; }
            @Override public String getRemoteHost() { return ip; }
        }, response);
    }
}
