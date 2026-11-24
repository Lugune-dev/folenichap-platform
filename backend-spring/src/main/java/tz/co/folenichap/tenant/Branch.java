package tz.co.folenichap.tenant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Filter;
import org.hibernate.annotations.FilterDef;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.ParamDef;
import org.hibernate.type.SqlTypes;
import tz.co.folenichap.common.TenantScopedEntity;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** A physical location of a tenant. Also hosts the global tenant filter definition. */
@Entity
@Table(name = "branches")
@FilterDef(name = TenantScopedEntity.TENANT_FILTER,
        parameters = @ParamDef(name = TenantScopedEntity.TENANT_PARAM, type = UUID.class))
@Filter(name = TenantScopedEntity.TENANT_FILTER, condition = TenantScopedEntity.TENANT_CONDITION)
@Getter
@Setter
public class Branch extends TenantScopedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    private String address;

    private String phone;

    /** {"mon":{"open":"08:00","close":"18:00"}, ...}; missing day = closed. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "operating_hours", nullable = false, columnDefinition = "jsonb")
    private Map<String, Map<String, String>> operatingHours = new HashMap<>();

    @Column(name = "is_main", nullable = false)
    private boolean main;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}
