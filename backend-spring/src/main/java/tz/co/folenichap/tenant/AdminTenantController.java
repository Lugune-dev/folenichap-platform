package tz.co.folenichap.tenant;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
import tz.co.folenichap.common.PhoneNumbers;
import tz.co.folenichap.config.AppProperties;
import tz.co.folenichap.payment.MobileProvider;
import tz.co.folenichap.payment.PaymentService;
import tz.co.folenichap.payment.PaymentService.PushOutcome;
import tz.co.folenichap.security.AuthPrincipal;
import tz.co.folenichap.security.CurrentUser;
import tz.co.folenichap.tenant.TenantDtos.BranchRequest;
import tz.co.folenichap.tenant.TenantDtos.BranchView;
import tz.co.folenichap.tenant.TenantDtos.ProfileUpdate;
import tz.co.folenichap.tenant.TenantDtos.ProfileView;
import tz.co.folenichap.tenant.TenantDtos.SubscriptionPayRequest;

import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Business admin: profile, greetings, branches, subscription. */
@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminTenantController {

    private static final Set<String> DAYS = Set.of("mon", "tue", "wed", "thu", "fri", "sat", "sun");

    private final TenantGuard tenantGuard;
    private final BranchRepository branches;
    private final PaymentService paymentService;
    private final AppProperties props;

    @GetMapping("/profile")
    @Transactional(readOnly = true)
    public ProfileView profile(@CurrentUser AuthPrincipal user) {
        return ProfileView.of(tenantGuard.load(user.requireTenant()), props.publicBaseUrl());
    }

    @PutMapping("/profile")
    @Transactional
    public ProfileView updateProfile(@CurrentUser AuthPrincipal user, @Valid @RequestBody ProfileUpdate req) {
        Tenant t = tenantGuard.load(user.requireTenant());
        t.setBusinessName(req.businessName().trim());
        t.setPhone(PhoneNumbers.normalize(req.phone()));
        t.setBusinessCategory(req.businessCategory());
        t.setLogoUrl(req.logoUrl());
        t.setGreetingEn(req.greetingEn());
        t.setGreetingSw(req.greetingSw());
        if (req.defaultLanguage() != null) {
            t.setDefaultLanguage(req.defaultLanguage());
        }
        return ProfileView.of(t, props.publicBaseUrl());
    }

    @GetMapping("/branches")
    @Transactional(readOnly = true)
    public List<BranchView> branches(@CurrentUser AuthPrincipal user) {
        return branches.findByTenantIdOrderByMainDescNameAsc(user.requireTenant()).stream().map(BranchView::of).toList();
    }

    @PostMapping("/branches")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public BranchView createBranch(@CurrentUser AuthPrincipal user, @Valid @RequestBody BranchRequest req) {
        UUID tenantId = user.requireTenant();
        Tenant t = tenantGuard.load(tenantId);
        if (branches.countByTenantIdAndActiveTrue(tenantId) >= t.effectivePlan().maxBranches()) {
            throw ApiException.forbidden("PLAN_LIMIT", "Your plan allows " + t.effectivePlan().maxBranches()
                    + " branch(es). Upgrade to add more.");
        }
        Branch b = new Branch();
        b.setTenantId(tenantId);
        apply(b, req);
        return BranchView.of(branches.save(b));
    }

    @PutMapping("/branches/{id}")
    @Transactional
    public BranchView updateBranch(@CurrentUser AuthPrincipal user, @PathVariable UUID id, @Valid @RequestBody BranchRequest req) {
        Branch b = branches.findByIdAndTenantId(id, user.requireTenant()).orElseThrow(() -> ApiException.notFound("Branch"));
        if (b.isMain() && Boolean.FALSE.equals(req.active())) {
            throw ApiException.badRequest("MAIN_BRANCH", "The main branch cannot be deactivated");
        }
        apply(b, req);
        return BranchView.of(b);
    }

    /** Pay the SaaS subscription by mobile money (activates/extends 30 days on success). */
    @PostMapping("/subscription/pay")
    public PushOutcome paySubscription(@CurrentUser AuthPrincipal user, @Valid @RequestBody SubscriptionPayRequest req) {
        return paymentService.paySubscription(user.requireTenant(), req.plan(), MobileProvider.valueOf(req.provider()), req.phone());
    }

    private void apply(Branch b, BranchRequest req) {
        b.setName(req.name().trim());
        b.setAddress(req.address());
        b.setPhone(req.phone() == null || req.phone().isBlank() ? null : PhoneNumbers.normalize(req.phone()));
        if (req.operatingHours() != null) {
            validateHours(req.operatingHours());
            b.setOperatingHours(req.operatingHours());
        }
        if (req.active() != null) {
            b.setActive(req.active());
        }
    }

    private void validateHours(Map<String, Map<String, String>> hours) {
        hours.forEach((day, range) -> {
            if (!DAYS.contains(day) || range == null) {
                throw ApiException.badRequest("INVALID_HOURS", "Unknown day: " + day);
            }
            try {
                LocalTime open = LocalTime.parse(range.get("open"));
                LocalTime close = LocalTime.parse(range.get("close"));
                if (!close.isAfter(open)) {
                    throw ApiException.badRequest("INVALID_HOURS", "Closing time must be after opening time on " + day);
                }
            } catch (ApiException e) {
                throw e;
            } catch (Exception e) {
                throw ApiException.badRequest("INVALID_HOURS", "Use HH:mm format for " + day);
            }
        });
    }
}
