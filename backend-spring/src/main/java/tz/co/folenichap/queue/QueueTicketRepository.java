package tz.co.folenichap.queue;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QueueTicketRepository extends JpaRepository<QueueTicket, UUID> {

    Optional<QueueTicket> findByIdAndTenantId(UUID id, UUID tenantId);

    Optional<QueueTicket> findByTrackingToken(String trackingToken);

    List<QueueTicket> findByTenantIdAndBranchIdAndQueueDateOrderByJoinedAtAsc(UUID tenantId, UUID branchId, LocalDate date);

    List<QueueTicket> findByTenantIdAndBranchIdAndQueueDateAndStatusOrderByJoinedAtAsc(
            UUID tenantId, UUID branchId, LocalDate date, TicketStatus status);

    List<QueueTicket> findByTenantIdAndBranchIdAndQueueDateAndStatusInOrderByCalledAtDesc(
            UUID tenantId, UUID branchId, LocalDate date, Collection<TicketStatus> statuses);

    Optional<QueueTicket> findFirstByTenantIdAndServiceIdAndBranchIdAndQueueDateAndCustomerPhoneAndStatusIn(
            UUID tenantId, UUID serviceId, UUID branchId, LocalDate date, String phone, Collection<TicketStatus> statuses);

    /**
     * Atomically claims the oldest callable WAITING ticket. {@code SKIP LOCKED} lets several agents
     * press "Call Next" at the same moment without ever receiving the same customer.
     * Tickets for services requiring upfront payment are skipped until PAID/WAIVED.
     */
    @Query(value = """
            SELECT t.* FROM queue_tickets t
            JOIN services s ON s.id = t.service_id
            WHERE t.tenant_id = :tenantId AND t.branch_id = :branchId AND t.queue_date = :queueDate
              AND t.status = 'WAITING'
              AND (NOT s.require_upfront_payment OR t.payment_status IN ('PAID', 'WAIVED'))
            ORDER BY t.joined_at, t.sequence_no
            LIMIT 1
            FOR UPDATE OF t SKIP LOCKED
            """, nativeQuery = true)
    Optional<QueueTicket> lockNextWaiting(@Param("tenantId") UUID tenantId, @Param("branchId") UUID branchId,
                                          @Param("queueDate") LocalDate queueDate);

    @Query(value = """
            SELECT t.* FROM queue_tickets t
            JOIN services s ON s.id = t.service_id
            WHERE t.tenant_id = :tenantId AND t.branch_id = :branchId AND t.queue_date = :queueDate
              AND t.status = 'WAITING' AND t.service_id IN (:serviceIds)
              AND (NOT s.require_upfront_payment OR t.payment_status IN ('PAID', 'WAIVED'))
            ORDER BY t.joined_at, t.sequence_no
            LIMIT 1
            FOR UPDATE OF t SKIP LOCKED
            """, nativeQuery = true)
    Optional<QueueTicket> lockNextWaitingForServices(@Param("tenantId") UUID tenantId, @Param("branchId") UUID branchId,
                                                     @Param("queueDate") LocalDate queueDate,
                                                     @Param("serviceIds") Collection<UUID> serviceIds);

    /** People ahead of a ticket within the same service queue. */
    @Query("""
            select count(t) from QueueTicket t
            where t.tenantId = :tenantId and t.branchId = :branchId and t.serviceId = :serviceId
              and t.queueDate = :queueDate and t.status = tz.co.folenichap.queue.TicketStatus.WAITING
              and (t.joinedAt < :joinedAt or (t.joinedAt = :joinedAt and t.sequenceNo < :seq))
            """)
    long countAhead(@Param("tenantId") UUID tenantId, @Param("branchId") UUID branchId,
                    @Param("serviceId") UUID serviceId, @Param("queueDate") LocalDate queueDate,
                    @Param("joinedAt") Instant joinedAt, @Param("seq") int seq);

    /** Number of distinct agents who called someone recently: our parallelism for ETA. */
    @Query(value = """
            SELECT count(DISTINCT served_by_user_id) FROM queue_tickets
            WHERE branch_id = :branchId AND queue_date = :queueDate
              AND served_by_user_id IS NOT NULL AND called_at > :since
            """, nativeQuery = true)
    long countActiveAgents(@Param("branchId") UUID branchId, @Param("queueDate") LocalDate queueDate,
                           @Param("since") Instant since);

    /** End of day: tickets never served become NO_SHOW. */
    @Modifying
    @Query(value = """
            UPDATE queue_tickets SET status = 'NO_SHOW', version = version + 1
            WHERE queue_date < :today AND status IN ('WAITING', 'CALLED')
            """, nativeQuery = true)
    int closeStaleTickets(@Param("today") LocalDate today);

    @Modifying
    @Query(value = """
            UPDATE queue_tickets SET status = 'COMPLETED', completed_at = now(), version = version + 1
            WHERE queue_date < :today AND status = 'SERVING'
            """, nativeQuery = true)
    int completeStaleServing(@Param("today") LocalDate today);
}
