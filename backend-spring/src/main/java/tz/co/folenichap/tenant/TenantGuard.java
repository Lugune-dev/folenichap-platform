package tz.co.folenichap.tenant;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tz.co.folenichap.common.ApiException;

import java.util.UUID;

/** Loads tenants/branches and enforces subscription state and plan limits. */
@Component
@RequiredArgsConstructor
public class TenantGuard {

    private final TenantRepository tenants;
    private final BranchRepository branches;

    public Tenant load(UUID tenantId) {
        return tenants.findById(tenantId).orElseThrow(() -> ApiException.notFound("Business"));
    }

    public Tenant loadBySlug(String slug) {
        return tenants.findBySlug(slug).orElseThrow(() -> ApiException.notFound("Business"));
    }

    public Tenant requireOperational(UUID tenantId) {
        Tenant t = load(tenantId);
        requireOperational(t);
        return t;
    }

    public void requireOperational(Tenant t) {
        if (!t.getSubscriptionStatus().canOperate()) {
            throw ApiException.paymentRequired("TENANT_INACTIVE",
                    "This business is not accepting queue tickets right now");
        }
    }

    /** Resolve the branch for an operation: explicit id, else user's branch, else main branch. */
    public Branch resolveBranch(UUID tenantId, UUID requested, UUID fallback) {
        UUID id = requested != null ? requested : fallback;
        if (id != null) {
            return branches.findByIdAndTenantId(id, tenantId)
                    .filter(Branch::isActive)
                    .orElseThrow(() -> ApiException.notFound("Branch"));
        }
        return branches.findFirstByTenantIdAndMainTrue(tenantId)
                .orElseThrow(() -> ApiException.notFound("Branch"));
    }
}
