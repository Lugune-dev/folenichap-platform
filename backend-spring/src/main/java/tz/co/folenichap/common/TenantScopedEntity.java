package tz.co.folenichap.common;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

/**
 * Base class for every business table carrying a mandatory {@code tenant_id}.
 * Each concrete entity declares {@code @Filter(name = TENANT_FILTER, ...)}; the filter
 * definition lives on {@link tz.co.folenichap.tenant.Branch}.
 */
@MappedSuperclass
@Getter
@Setter
public abstract class TenantScopedEntity {

    public static final String TENANT_FILTER = "tenantFilter";
    public static final String TENANT_PARAM = "tenantId";
    public static final String TENANT_CONDITION = "tenant_id = :tenantId";

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;
}
