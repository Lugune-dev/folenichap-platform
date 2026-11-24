package tz.co.folenichap.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.co.folenichap.auth.AuthDtos.LoginRequest;
import tz.co.folenichap.auth.AuthDtos.RegisterRequest;
import tz.co.folenichap.auth.AuthDtos.TokenResponse;
import tz.co.folenichap.auth.AuthDtos.UserView;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.common.AuditService;
import tz.co.folenichap.common.PhoneNumbers;
import tz.co.folenichap.common.Slugs;
import tz.co.folenichap.config.AppProperties;
import tz.co.folenichap.queue.ServiceOffering;
import tz.co.folenichap.queue.ServiceRepository;
import tz.co.folenichap.security.JwtService;
import tz.co.folenichap.security.LoginProtection;
import tz.co.folenichap.tenant.Branch;
import tz.co.folenichap.tenant.BranchRepository;
import tz.co.folenichap.tenant.SubscriptionStatus;
import tz.co.folenichap.tenant.Tenant;
import tz.co.folenichap.tenant.TenantRepository;
import tz.co.folenichap.user.AppUser;
import tz.co.folenichap.user.RefreshToken;
import tz.co.folenichap.user.RefreshTokenRepository;
import tz.co.folenichap.user.Role;
import tz.co.folenichap.user.UserRepository;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class AuthService {

    private static final Set<String> RESERVED_SLUGS = Set.of("admin", "api", "app", "login", "register",
            "super", "tv", "desk", "b", "t", "www", "support", "help");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final TenantRepository tenants;
    private final BranchRepository branches;
    private final UserRepository users;
    private final ServiceRepository services;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder encoder;
    private final JwtService jwtService;
    private final AppProperties props;
    private final AuditService audit;
    private final LoginProtection loginProtection;

    private volatile String dummyHash;

    @Transactional
    public TokenResponse register(RegisterRequest req) {
        String email = req.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email) || tenants.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("EMAIL_TAKEN", "An account with this email already exists");
        }
        String phone = PhoneNumbers.normalize(req.phone());
        String language = req.language() == null ? "sw" : req.language();

        Tenant t = new Tenant();
        t.setBusinessName(req.businessName().trim());
        t.setSlug(uniqueSlug(req.slug() == null || req.slug().isBlank() ? Slugs.slugify(req.businessName()) : req.slug()));
        t.setEmail(email);
        t.setPhone(phone);
        t.setBusinessCategory(req.businessCategory());
        t.setDefaultLanguage(language);
        t.setGreetingSw("Karibu " + t.getBusinessName() + "! Chagua huduma ili upate namba yako ya foleni.");
        t.setGreetingEn("Welcome to " + t.getBusinessName() + "! Choose a service to get your queue number.");
        t.setTrialEndsAt(Instant.now().plus(Duration.ofDays(props.trialDays())));
        t.setSubscriptionStatus(props.requireTenantApproval() ? SubscriptionStatus.PENDING_APPROVAL : SubscriptionStatus.TRIAL);
        tenants.save(t);

        Branch main = new Branch();
        main.setTenantId(t.getId());
        main.setName("Main / Tawi Kuu");
        main.setMain(true);
        main.setPhone(phone);
        branches.save(main);

        ServiceOffering general = new ServiceOffering();
        general.setTenantId(t.getId());
        general.setName("General Service");
        general.setNameSw("Huduma ya Kawaida");
        general.setTicketPrefix("G");
        general.setAvgDurationMinutes(15);
        general.setFeeAmount(BigDecimal.ZERO);
        services.save(general);

        AppUser admin = new AppUser();
        admin.setTenantId(t.getId());
        admin.setBranchId(main.getId());
        admin.setFullName(req.ownerName().trim());
        admin.setEmail(email);
        admin.setPhone(phone);
        admin.setRole(Role.TENANT_ADMIN);
        admin.setCounterLabel("Reception");
        admin.setPreferredLanguage(language);
        admin.setPasswordHash(encoder.encode(req.password()));
        users.save(admin);

        audit.record(t.getId(), admin.getId(), "TENANT_REGISTERED", "tenant", t.getId(), Map.of("slug", t.getSlug()));

        if (t.getSubscriptionStatus() == SubscriptionStatus.PENDING_APPROVAL) {
            // no tokens until the platform owner approves; the client shows a "pending" screen
            return new TokenResponse(null, null, 0, view(admin, t));
        }
        return issueTokens(admin, t);
    }

    /**
     * Password login with brute-force protection. The bcrypt check always runs (against a dummy hash
     * when the email is unknown) so response timing does not reveal which emails are registered.
     * Failed attempts are audited, so the transaction must not roll back on bad credentials.
     */
    @Transactional(noRollbackFor = BadCredentialsException.class)
    public TokenResponse login(LoginRequest req, String clientIp) {
        String email = req.email().trim().toLowerCase();
        loginProtection.checkLoginAllowed(clientIp, email);

        AppUser user = users.findByEmailIgnoreCase(email).orElse(null);
        boolean passwordOk = encoder.matches(req.password(), user == null ? dummyHash() : user.getPasswordHash());
        if (user == null || !passwordOk || !user.isActive()) {
            boolean locked = loginProtection.recordFailure(email);
            audit.record(user == null ? null : user.getTenantId(), user == null ? null : user.getId(),
                    locked ? "LOGIN_LOCKED" : "LOGIN_FAILED", "user", user == null ? null : user.getId(),
                    Map.of("email", email, "ip", String.valueOf(clientIp)));
            throw new BadCredentialsException("bad credentials");
        }
        loginProtection.recordSuccess(email);
        Tenant tenant = loadAndCheckTenant(user);
        user.setLastLoginAt(Instant.now());
        return issueTokens(user, tenant);
    }

    private String dummyHash() {
        String h = dummyHash;
        if (h == null) {
            h = encoder.encode("timing-equaliser-" + RANDOM.nextLong());
            dummyHash = h;
        }
        return h;
    }

    @Transactional
    public TokenResponse refresh(String rawRefreshToken) {
        RefreshToken stored = refreshTokens.findByTokenHash(sha256(rawRefreshToken))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH", "Session expired"));
        Instant now = Instant.now();
        if (stored.getRevokedAt() != null) {
            // token reuse => possible theft: revoke the whole family
            refreshTokens.revokeAllForUser(stored.getUserId(), now);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH", "Session expired");
        }
        if (!stored.isUsable(now)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH", "Session expired");
        }
        stored.setRevokedAt(now); // rotation
        AppUser user = users.findById(stored.getUserId()).filter(AppUser::isActive)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH", "Session expired"));
        return issueTokens(user, loadAndCheckTenant(user));
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        refreshTokens.findByTokenHash(sha256(rawRefreshToken)).ifPresent(t -> t.setRevokedAt(Instant.now()));
    }

    @Transactional(readOnly = true)
    public UserView me(java.util.UUID userId) {
        AppUser user = users.findById(userId).orElseThrow(() -> ApiException.notFound("User"));
        Tenant tenant = user.getTenantId() == null ? null : tenants.findById(user.getTenantId()).orElse(null);
        return view(user, tenant);
    }

    private Tenant loadAndCheckTenant(AppUser user) {
        if (user.getRole() == Role.SUPER_ADMIN) {
            return null;
        }
        Tenant tenant = tenants.findById(user.getTenantId()).orElseThrow(() -> ApiException.notFound("Business"));
        if (tenant.getSubscriptionStatus() == SubscriptionStatus.PENDING_APPROVAL) {
            throw ApiException.forbidden("PENDING_APPROVAL", "Your business account is awaiting approval");
        }
        if (tenant.getSubscriptionStatus() == SubscriptionStatus.SUSPENDED && user.getRole() != Role.TENANT_ADMIN) {
            // admins may still log in to see billing; staff are blocked
            throw ApiException.forbidden("TENANT_SUSPENDED", "This business account is suspended");
        }
        return tenant;
    }

    private TokenResponse issueTokens(AppUser user, Tenant tenant) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        RefreshToken rt = new RefreshToken();
        rt.setUserId(user.getId());
        rt.setTokenHash(sha256(raw));
        rt.setExpiresAt(Instant.now().plus(Duration.ofDays(props.security().refreshTokenDays())));
        refreshTokens.save(rt);
        return new TokenResponse(jwtService.issueAccessToken(user), raw, jwtService.accessTtlSeconds(), view(user, tenant));
    }

    static UserView view(AppUser u, Tenant t) {
        return new UserView(u.getId(), u.getFullName(), u.getEmail(), u.getRole().name(), u.getTenantId(),
                t == null ? null : t.getSlug(), t == null ? null : t.getBusinessName(), u.getBranchId(),
                u.getCounterLabel(), u.getPreferredLanguage(),
                t == null ? null : t.getSubscriptionPlan().name(),
                t == null ? null : t.getSubscriptionStatus().name());
    }

    private String uniqueSlug(String base) {
        String slug = Slugs.slugify(base);
        if (RESERVED_SLUGS.contains(slug)) {
            slug = slug + "-tz";
        }
        String candidate = slug;
        int i = 2;
        while (tenants.existsBySlug(candidate)) {
            candidate = slug + "-" + i++;
        }
        return candidate;
    }

    static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
