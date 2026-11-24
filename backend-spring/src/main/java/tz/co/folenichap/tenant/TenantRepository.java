package tz.co.folenichap.tenant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TenantRepository extends JpaRepository<Tenant, UUID> {

    Optional<Tenant> findBySlug(String slug);

    boolean existsBySlug(String slug);

    @Query("select case when count(t) > 0 then true else false end from Tenant t where lower(t.email) = lower(?1)")
    boolean existsByEmailIgnoreCase(String email);

    @Query("select t from Tenant t where t.subscriptionStatus = tz.co.folenichap.tenant.SubscriptionStatus.TRIAL and t.trialEndsAt < ?1")
    List<Tenant> findExpiredTrials(Instant now);

    @Query("select t from Tenant t where t.subscriptionStatus = tz.co.folenichap.tenant.SubscriptionStatus.ACTIVE and t.currentPeriodEndsAt < ?1")
    List<Tenant> findLapsedSubscriptions(Instant now);

    List<Tenant> findAllByOrderByCreatedAtDesc();
}
