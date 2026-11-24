package tz.co.folenichap.security;

import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.user.Role;

import java.util.UUID;

/** Authenticated user extracted from a verified JWT. */
public record AuthPrincipal(UUID userId, UUID tenantId, Role role, String email, String fullName, UUID branchId) {

    public UUID requireTenant() {
        if (tenantId == null) {
            throw ApiException.forbidden("TENANT_REQUIRED", "This action requires a business account");
        }
        return tenantId;
    }
}
