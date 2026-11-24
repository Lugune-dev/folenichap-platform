package tz.co.folenichap.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface PasswordResetCodeRepository extends JpaRepository<PasswordResetCode, UUID> {

    /** Only the newest unused code is valid; requesting a new code replaces older ones. */
    Optional<PasswordResetCode> findFirstByUserIdAndUsedAtIsNullOrderByCreatedAtDesc(UUID userId);

    Optional<PasswordResetCode> findFirstByUserIdOrderByCreatedAtDesc(UUID userId);

    long countByUserIdAndCreatedAtAfter(UUID userId, Instant since);

    @Modifying
    @Query("update PasswordResetCode c set c.usedAt = ?2 where c.userId = ?1 and c.usedAt is null")
    int invalidateAll(UUID userId, Instant now);

    @Modifying
    @Query("delete from PasswordResetCode c where c.createdAt < ?1")
    int deleteOlderThan(Instant cutoff);
}
