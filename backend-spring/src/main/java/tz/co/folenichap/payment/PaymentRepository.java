package tz.co.folenichap.payment;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.externalReference = ?1")
    Optional<Payment> lockByReference(String reference);

    Optional<Payment> findFirstByTicketIdOrderByCreatedAtDesc(UUID ticketId);

    Page<Payment> findByTenantIdOrderByCreatedAtDesc(UUID tenantId, Pageable pageable);

    List<Payment> findByStatusAndCreatedAtBefore(Payment.Status status, Instant before);
}
