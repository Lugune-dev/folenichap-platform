package tz.co.folenichap.queue;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.Filter;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.common.TenantScopedEntity;

import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Core transactional entity: one customer's place in a queue for one day. */
@Entity
@Table(name = "queue_tickets")
@DynamicUpdate // only changed columns: avoids clobbering flags set by concurrent JDBC updates
@Filter(name = TenantScopedEntity.TENANT_FILTER, condition = TenantScopedEntity.TENANT_CONDITION)
@Getter
@Setter
public class QueueTicket extends TenantScopedEntity {

    /** Allowed state machine transitions. */
    private static final Map<TicketStatus, Set<TicketStatus>> TRANSITIONS = Map.of(
            TicketStatus.WAITING, EnumSet.of(TicketStatus.CALLED, TicketStatus.NO_SHOW, TicketStatus.CANCELLED),
            TicketStatus.CALLED, EnumSet.of(TicketStatus.CALLED, TicketStatus.SERVING, TicketStatus.NO_SHOW,
                    TicketStatus.WAITING, TicketStatus.COMPLETED),
            TicketStatus.SERVING, EnumSet.of(TicketStatus.COMPLETED),
            TicketStatus.COMPLETED, EnumSet.noneOf(TicketStatus.class),
            TicketStatus.NO_SHOW, EnumSet.of(TicketStatus.WAITING),
            TicketStatus.CANCELLED, EnumSet.noneOf(TicketStatus.class));

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "branch_id", nullable = false)
    private UUID branchId;

    @Column(name = "service_id", nullable = false)
    private UUID serviceId;

    @Column(name = "served_by_user_id")
    private UUID servedByUserId;

    @Column(name = "ticket_number", nullable = false)
    private String ticketNumber;

    @Column(name = "sequence_no", nullable = false)
    private int sequenceNo;

    @Column(name = "tracking_token", nullable = false, unique = true)
    private String trackingToken;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "customer_phone", nullable = false)
    private String customerPhone;

    @Column(name = "customer_language", nullable = false)
    private String customerLanguage = "sw";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TicketSource source = TicketSource.QR;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TicketStatus status = TicketStatus.WAITING;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status", nullable = false)
    private PaymentStatus paymentStatus = PaymentStatus.UNPAID;

    @Column(name = "counter_label")
    private String counterLabel;

    @Column(name = "queue_date", nullable = false)
    private LocalDate queueDate;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt = Instant.now();

    @Column(name = "called_at")
    private Instant calledAt;

    @Column(name = "service_started_at")
    private Instant serviceStartedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "recall_count", nullable = false)
    private int recallCount;

    @Column(name = "near_turn_notified", nullable = false)
    private boolean nearTurnNotified;

    private String notes;

    @Version
    @Column(nullable = false)
    private long version;

    public void transitionTo(TicketStatus next) {
        if (!TRANSITIONS.getOrDefault(status, Set.of()).contains(next)) {
            throw ApiException.conflict("INVALID_TRANSITION",
                    "Ticket " + ticketNumber + " cannot move from " + status + " to " + next);
        }
        this.status = next;
    }
}
