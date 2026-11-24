package tz.co.folenichap.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;
import tz.co.folenichap.config.AppProperties;
import tz.co.folenichap.user.AppUser;
import tz.co.folenichap.user.Role;

import javax.crypto.SecretKey;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;

@Service
public class JwtService {

    private static final String ISSUER = "folenichap";
    private static final String AUDIENCE = "folenichap-api";

    private final SecretKey key;
    private final Duration accessTtl;

    public JwtService(AppProperties props) {
        String secret = props.security().jwtSecret();
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("JWT_SECRET is not configured (use: openssl rand -base64 48)");
        }
        byte[] bytes = Decoders.BASE64.decode(secret);
        if (bytes.length < 32) {
            throw new IllegalStateException("JWT_SECRET must decode to at least 256 bits");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.accessTtl = Duration.ofMinutes(props.security().accessTokenMinutes());
    }

    public String issueAccessToken(AppUser user) {
        Instant now = Instant.now();
        var builder = Jwts.builder()
                .issuer(ISSUER)
                .audience().add(AUDIENCE).and()
                .subject(user.getId().toString())
                .claim("role", user.getRole().name())
                .claim("email", user.getEmail())
                .claim("name", user.getFullName())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(accessTtl)));
        if (user.getTenantId() != null) {
            builder.claim("tid", user.getTenantId().toString());
        }
        if (user.getBranchId() != null) {
            builder.claim("bid", user.getBranchId().toString());
        }
        return builder.signWith(key).compact();
    }

    public long accessTtlSeconds() {
        return accessTtl.toSeconds();
    }

    public Optional<AuthPrincipal> parse(String token) {
        try {
            Claims c = Jwts.parser()
                    .verifyWith(key)
                    .requireIssuer(ISSUER)
                    .requireAudience(AUDIENCE)
                    .clockSkewSeconds(30)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            return Optional.of(new AuthPrincipal(
                    UUID.fromString(c.getSubject()),
                    uuidOrNull(c.get("tid", String.class)),
                    Role.valueOf(c.get("role", String.class)),
                    c.get("email", String.class),
                    c.get("name", String.class),
                    uuidOrNull(c.get("bid", String.class))));
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    private static UUID uuidOrNull(String s) {
        return s == null ? null : UUID.fromString(s);
    }
}
