package tz.co.folenichap.tenant;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tz.co.folenichap.common.AuditService;
import tz.co.folenichap.user.RefreshTokenRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/** Trial expiry, dunning and housekeeping. */
@Slf4j
@Component
@RequiredArgsConstructor
public class SubscriptionJobs {

    private static final Duration GRACE = Duration.ofDays(3);

    private final TenantRepository tenants;
    private final RefreshTokenRepository refreshTokens;
    private final AuditService audit;

    @Scheduled(cron = "0 5 * * * *")
    @Transactional
    public void enforceSubscriptions() {
        Instant now = Instant.now();
        for (Tenant t : tenants.findExpiredTrials(now)) {
            t.setSubscriptionStatus(SubscriptionStatus.SUSPENDED);
            audit.record(t.getId(), null, "TRIAL_EXPIRED", "tenant", t.getId(), Map.of());
            log.info("Trial expired -> suspended: {}", t.getSlug());
        }
        for (Tenant t : tenants.findLapsedSubscriptions(now)) {
            // ACTIVE -> PAST_DUE (keeps working during grace period)
            t.setSubscriptionStatus(SubscriptionStatus.PAST_DUE);
            audit.record(t.getId(), null, "SUBSCRIPTION_PAST_DUE", "tenant", t.getId(), Map.of());
        }
        tenants.findAll().stream()
                .filter(t -> t.getSubscriptionStatus() == SubscriptionStatus.PAST_DUE)
                .filter(t -> t.getCurrentPeriodEndsAt() != null && t.getCurrentPeriodEndsAt().plus(GRACE).isBefore(now))
                .forEach(t -> {
                    t.setSubscriptionStatus(SubscriptionStatus.SUSPENDED);
                    audit.record(t.getId(), null, "SUBSCRIPTION_SUSPENDED", "tenant", t.getId(), Map.of());
                });
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purgeExpiredRefreshTokens() {
        int n = refreshTokens.deleteExpired(Instant.now());
        if (n > 0) {
            log.info("Purged {} expired refresh tokens", n);
        }
    }
}
