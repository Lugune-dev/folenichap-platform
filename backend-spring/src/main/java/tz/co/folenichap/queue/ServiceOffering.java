package tz.co.folenichap.queue;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Filter;
import tz.co.folenichap.common.TenantScopedEntity;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** A service a tenant offers, e.g. "Dental Cleaning" with ticket prefix "D". */
@Entity
@Table(name = "services")
@Filter(name = TenantScopedEntity.TENANT_FILTER, condition = TenantScopedEntity.TENANT_CONDITION)
@Getter
@Setter
public class ServiceOffering extends TenantScopedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(name = "name_sw")
    private String nameSw;

    private String description;

    @Column(name = "ticket_prefix", nullable = false)
    private String ticketPrefix;

    @Column(name = "avg_duration_minutes", nullable = false)
    private int avgDurationMinutes = 15;

    @Column(name = "fee_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal feeAmount = BigDecimal.ZERO;

    @Column(name = "require_upfront_payment", nullable = false)
    private boolean requireUpfrontPayment;

    @Column(nullable = false)
    private String currency = "TZS";

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    /** Customers may book this service for a future time slot (slot length = avg duration). */
    @Column(name = "allow_appointments", nullable = false)
    private boolean allowAppointments;

    /** How many appointments may share one time slot (e.g. number of chairs or doctors). */
    @Column(name = "slot_capacity", nullable = false)
    private int slotCapacity = 1;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public boolean hasFee() {
        return feeAmount != null && feeAmount.signum() > 0;
    }
}
