package tz.co.folenichap.user;

import tz.co.folenichap.security.StrongPassword;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.common.AuditService;
import tz.co.folenichap.common.PhoneNumbers;
import tz.co.folenichap.security.AuthPrincipal;
import tz.co.folenichap.security.CurrentUser;
import tz.co.folenichap.tenant.BranchRepository;
import tz.co.folenichap.tenant.Tenant;
import tz.co.folenichap.tenant.TenantGuard;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Business admin manages receptionists/agents and assigns them to rooms or counters. */
@RestController
@RequestMapping("/api/v1/admin/staff")
@RequiredArgsConstructor
public class AdminStaffController {

    private final UserRepository users;
    private final BranchRepository branches;
    private final TenantGuard tenantGuard;
    private final PasswordEncoder encoder;
    private final RefreshTokenRepository refreshTokens;
    private final AuditService audit;

    public record StaffView(UUID id, String fullName, String email, String phone, String role, UUID branchId,
                            String counterLabel, String language, boolean active, Instant lastLoginAt) {
        static StaffView of(AppUser u) {
            return new StaffView(u.getId(), u.getFullName(), u.getEmail(), u.getPhone(), u.getRole().name(),
                    u.getBranchId(), u.getCounterLabel(), u.getPreferredLanguage(), u.isActive(), u.getLastLoginAt());
        }
    }

    public record CreateStaff(@NotBlank @Size(max = 120) String fullName,
                              @NotBlank @Email @Size(max = 150) String email,
                              @Size(max = 20) String phone,
                              @NotBlank @StrongPassword String password,
                              UUID branchId,
                              @Size(max = 50) String counterLabel,
                              @Pattern(regexp = "STAFF|TENANT_ADMIN") String role,
                              @Pattern(regexp = "sw|en") String language) {}

    public record UpdateStaff(@NotBlank @Size(max = 120) String fullName,
                              @Size(max = 20) String phone,
                              UUID branchId,
                              @Size(max = 50) String counterLabel,
                              @Pattern(regexp = "STAFF|TENANT_ADMIN") String role,
                              @Pattern(regexp = "sw|en") String language,
                              Boolean active) {}

    public record ResetPassword(@NotBlank @StrongPassword String password) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<StaffView> list(@CurrentUser AuthPrincipal user) {
        return users.findByTenantIdOrderByRoleAscFullNameAsc(user.requireTenant()).stream().map(StaffView::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public StaffView create(@CurrentUser AuthPrincipal user, @Valid @RequestBody CreateStaff req) {
        UUID tenantId = user.requireTenant();
        Tenant t = tenantGuard.load(tenantId);
        Role role = req.role() == null ? Role.STAFF : Role.valueOf(req.role());
        if (role == Role.STAFF && users.countByTenantIdAndRoleAndActiveTrue(tenantId, Role.STAFF) >= t.effectivePlan().maxStaff()) {
            throw ApiException.forbidden("PLAN_LIMIT", "Your plan allows up to " + t.effectivePlan().maxStaff()
                    + " counters/agents. Upgrade to Pro for unlimited counters.");
        }
        if (users.existsByEmailIgnoreCase(req.email())) {
            throw ApiException.conflict("EMAIL_TAKEN", "A user with this email already exists");
        }
        AppUser u = new AppUser();
        u.setTenantId(tenantId);
        u.setFullName(req.fullName().trim());
        u.setEmail(req.email().trim().toLowerCase());
        u.setPhone(req.phone() == null || req.phone().isBlank() ? null : PhoneNumbers.normalize(req.phone()));
        u.setPasswordHash(encoder.encode(req.password()));
        u.setRole(role);
        u.setBranchId(checkBranch(tenantId, req.branchId()));
        u.setCounterLabel(req.counterLabel());
        u.setPreferredLanguage(req.language() == null ? t.getDefaultLanguage() : req.language());
        users.save(u);
        audit.record(tenantId, user.userId(), "STAFF_CREATED", "user", u.getId(), Map.of("email", u.getEmail()));
        return StaffView.of(u);
    }

    @PutMapping("/{id}")
    @Transactional
    public StaffView update(@CurrentUser AuthPrincipal user, @PathVariable UUID id, @Valid @RequestBody UpdateStaff req) {
        UUID tenantId = user.requireTenant();
        AppUser u = users.findByIdAndTenantId(id, tenantId).orElseThrow(() -> ApiException.notFound("User"));
        if (u.getId().equals(user.userId()) && (Boolean.FALSE.equals(req.active())
                || (req.role() != null && !req.role().equals(u.getRole().name())))) {
            throw ApiException.badRequest("SELF_LOCKOUT", "You cannot deactivate or demote your own account");
        }
        Tenant t = tenantGuard.load(tenantId);
        boolean reactivatingStaff = Boolean.TRUE.equals(req.active()) && !u.isActive() && u.getRole() == Role.STAFF;
        if (reactivatingStaff && users.countByTenantIdAndRoleAndActiveTrue(tenantId, Role.STAFF) >= t.effectivePlan().maxStaff()) {
            throw ApiException.forbidden("PLAN_LIMIT", "Plan staff limit reached");
        }
        u.setFullName(req.fullName().trim());
        u.setPhone(req.phone() == null || req.phone().isBlank() ? null : PhoneNumbers.normalize(req.phone()));
        u.setBranchId(checkBranch(tenantId, req.branchId()));
        u.setCounterLabel(req.counterLabel());
        if (req.role() != null) u.setRole(Role.valueOf(req.role()));
        if (req.language() != null) u.setPreferredLanguage(req.language());
        if (req.active() != null) {
            u.setActive(req.active());
            if (!req.active()) {
                refreshTokens.revokeAllForUser(u.getId(), Instant.now());
            }
        }
        return StaffView.of(u);
    }

    @PostMapping("/{id}/reset-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void resetPassword(@CurrentUser AuthPrincipal user, @PathVariable UUID id, @Valid @RequestBody ResetPassword req) {
        AppUser u = users.findByIdAndTenantId(id, user.requireTenant()).orElseThrow(() -> ApiException.notFound("User"));
        u.setPasswordHash(encoder.encode(req.password()));
        refreshTokens.revokeAllForUser(u.getId(), Instant.now());
        audit.record(u.getTenantId(), user.userId(), "STAFF_PASSWORD_RESET", "user", u.getId(), Map.of());
    }

    private UUID checkBranch(UUID tenantId, UUID branchId) {
        if (branchId == null) {
            return null;
        }
        return branches.findByIdAndTenantId(branchId, tenantId).orElseThrow(() -> ApiException.notFound("Branch")).getId();
    }
}
