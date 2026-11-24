package tz.co.folenichap.auth;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.common.AuditService;
import tz.co.folenichap.security.LoginProtection;
import tz.co.folenichap.tenant.TenantRepository;
import tz.co.folenichap.user.AppUser;
import tz.co.folenichap.user.PasswordResetCode;
import tz.co.folenichap.user.PasswordResetCodeRepository;
import tz.co.folenichap.user.RefreshTokenRepository;
import tz.co.folenichap.user.Role;
import tz.co.folenichap.user.UserRepository;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;

/**
 * "Forgot password": a 6-digit code goes by WhatsApp/SMS to the phone on the account, and the
 * user enters it together with a new password.
 * <ul>
 *   <li>The request endpoint answers the same way whether or not the email exists.</li>
 *   <li>Codes are bcrypt-hashed, expire after {@value #CODE_MINUTES} minutes, allow
 *       {@value #MAX_ATTEMPTS} wrong guesses, and only the newest code is valid.</li>
 *   <li>At most {@value #MAX_CODES_PER_HOUR} codes per account per hour, one per minute.</li>
 *   <li>A successful reset signs the user out everywhere (all refresh tokens revoked).</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    static final int CODE_MINUTES = 15;
    static final int MAX_ATTEMPTS = 5;
    static final int MAX_CODES_PER_HOUR = 3;
    static final Duration MIN_INTERVAL = Duration.ofSeconds(60);

    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository users;
    private final TenantRepository tenants;
    private final PasswordResetCodeRepository codes;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder encoder;
    private final LoginProtection loginProtection;
    private final AuditService audit;
    private final ApplicationEventPublisher events;

    private volatile String dummyHash;

    /** Event consumed after commit by {@link PasswordResetNotifier}; the code exists only in memory. */
    public record CodeIssued(java.util.UUID tenantId, String phone, String language, String code) {}

    @Transactional
    public void requestCode(String rawEmail, String clientIp) {
        loginProtection.checkPasswordResetAllowed(clientIp);
        String email = rawEmail.trim().toLowerCase(Locale.ROOT);
        AppUser user = users.findByEmailIgnoreCase(email).filter(AppUser::isActive).orElse(null);
        if (user == null) {
            encoder.encode("timing-equaliser"); // same work as the real path, so timing reveals nothing
            return;
        }
        Instant now = Instant.now();
        boolean tooSoon = codes.findFirstByUserIdOrderByCreatedAtDesc(user.getId())
                .map(c -> c.getCreatedAt().isAfter(now.minus(MIN_INTERVAL))).orElse(false);
        if (tooSoon || codes.countByUserIdAndCreatedAtAfter(user.getId(), now.minus(Duration.ofHours(1))) >= MAX_CODES_PER_HOUR) {
            encoder.encode("timing-equaliser");
            audit.record(user.getTenantId(), user.getId(), "PASSWORD_RESET_THROTTLED", "user", user.getId(),
                    Map.of("ip", String.valueOf(clientIp)));
            return;
        }

        String phone = phoneFor(user);
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        codes.invalidateAll(user.getId(), now);
        PasswordResetCode c = new PasswordResetCode();
        c.setUserId(user.getId());
        c.setCodeHash(encoder.encode(code));
        c.setExpiresAt(now.plus(Duration.ofMinutes(CODE_MINUTES)));
        c.setRequestIp(clientIp);
        codes.save(c);

        if (phone == null) {
            audit.record(user.getTenantId(), user.getId(), "PASSWORD_RESET_NO_PHONE", "user", user.getId(), Map.of());
            return;
        }
        audit.record(user.getTenantId(), user.getId(), "PASSWORD_RESET_REQUESTED", "user", user.getId(),
                Map.of("ip", String.valueOf(clientIp)));
        events.publishEvent(new CodeIssued(user.getTenantId(), phone, user.getPreferredLanguage(), code));
    }

    /** Wrong guesses must be saved, so the transaction does not roll back on a bad code. */
    @Transactional(noRollbackFor = ApiException.class)
    public void reset(String rawEmail, String rawCode, String newPassword, String clientIp) {
        loginProtection.checkPasswordResetAttemptAllowed(clientIp);
        String email = rawEmail.trim().toLowerCase(Locale.ROOT);
        AppUser user = users.findByEmailIgnoreCase(email).filter(AppUser::isActive).orElse(null);
        PasswordResetCode c = user == null ? null
                : codes.findFirstByUserIdAndUsedAtIsNullOrderByCreatedAtDesc(user.getId()).orElse(null);
        Instant now = Instant.now();
        boolean usable = c != null && c.getExpiresAt().isAfter(now) && c.getAttempts() < MAX_ATTEMPTS;
        boolean matches = encoder.matches(rawCode, usable ? c.getCodeHash() : dummyHash());
        if (!usable || !matches) {
            if (c != null) {
                c.setAttempts(c.getAttempts() + 1);
            }
            if (user != null) {
                audit.record(user.getTenantId(), user.getId(), "PASSWORD_RESET_FAILED", "user", user.getId(),
                        Map.of("ip", String.valueOf(clientIp)));
            }
            throw ApiException.badRequest("INVALID_RESET_CODE", "The code is wrong or has expired");
        }

        user.setPasswordHash(encoder.encode(newPassword));
        codes.invalidateAll(user.getId(), now);
        refreshTokens.revokeAllForUser(user.getId(), now);
        loginProtection.recordSuccess(email); // clears any sign-in lockout for this email
        audit.record(user.getTenantId(), user.getId(), "PASSWORD_RESET", "user", user.getId(),
                Map.of("ip", String.valueOf(clientIp)));
    }

    /** The user's own phone; for a business owner without one, the business phone. */
    private String phoneFor(AppUser user) {
        if (user.getPhone() != null && !user.getPhone().isBlank()) {
            return user.getPhone();
        }
        if (user.getRole() == Role.TENANT_ADMIN && user.getTenantId() != null) {
            return tenants.findById(user.getTenantId()).map(t -> t.getPhone()).orElse(null);
        }
        return null;
    }

    private String dummyHash() {
        String h = dummyHash;
        if (h == null) {
            h = encoder.encode("dummy-" + RANDOM.nextLong());
            dummyHash = h;
        }
        return h;
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "Africa/Dar_es_Salaam")
    @Transactional
    public void purgeOldCodes() {
        codes.deleteOlderThan(Instant.now().minus(Duration.ofDays(7)));
    }
}
