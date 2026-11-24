package tz.co.folenichap.tenant;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.common.AuditService;
import tz.co.folenichap.config.AppProperties;
import tz.co.folenichap.queue.live.SseBroadcaster;
import tz.co.folenichap.security.AuthPrincipal;
import tz.co.folenichap.security.CurrentUser;
import tz.co.folenichap.tenant.TenantDtos.CreditTopUp;
import tz.co.folenichap.tenant.TenantDtos.PlatformMetrics;
import tz.co.folenichap.tenant.TenantDtos.TenantPlanUpdate;
import tz.co.folenichap.tenant.TenantDtos.TenantStatusUpdate;
import tz.co.folenichap.tenant.TenantDtos.TenantSummary;
import tz.co.folenichap.tenant.TenantDtos.TrialExtension;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Platform owner console: approve/suspend/upgrade tenants, MRR and gateway health. */
@RestController
@RequestMapping("/api/v1/super")
@RequiredArgsConstructor
public class SuperAdminController {

    private final TenantRepository tenants;
    private final JdbcTemplate jdbc;
    private final AppProperties props;
    private final SseBroadcaster broadcaster;
    private final AuditService audit;

    @GetMapping("/tenants")
    public List<TenantSummary> tenants() {
        return jdbc.query("""
                SELECT t.*,
                       (SELECT count(*) FROM queue_tickets q WHERE q.tenant_id = t.id
                          AND q.queue_date >= current_date - 30) AS tickets_30d,
                       (SELECT count(*) FROM users u WHERE u.tenant_id = t.id AND u.is_active) AS staff
                FROM tenants t ORDER BY t.created_at DESC
                """, (rs, i) -> new TenantSummary(rs.getObject("id", UUID.class), rs.getString("business_name"),
                rs.getString("slug"), rs.getString("email"), rs.getString("phone"), rs.getString("subscription_plan"),
                rs.getString("subscription_status"), instant(rs.getTimestamp("trial_ends_at")),
                instant(rs.getTimestamp("current_period_ends_at")), rs.getInt("sms_credits"),
                instant(rs.getTimestamp("created_at")), rs.getLong("tickets_30d"), rs.getLong("staff")));
    }

    @GetMapping("/metrics")
    public PlatformMetrics metrics() {
        Map<String, Object> m = jdbc.queryForMap("""
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE subscription_status IN ('ACTIVE','PAST_DUE')) AS active,
                       count(*) FILTER (WHERE subscription_status = 'TRIAL') AS trial,
                       count(*) FILTER (WHERE subscription_status = 'SUSPENDED') AS suspended,
                       count(*) FILTER (WHERE subscription_status = 'PENDING_APPROVAL') AS pending,
                       count(*) FILTER (WHERE subscription_status IN ('ACTIVE','PAST_DUE') AND subscription_plan = 'STARTER') AS starter_paying,
                       count(*) FILTER (WHERE subscription_status IN ('ACTIVE','PAST_DUE') AND subscription_plan = 'PRO') AS pro_paying,
                       COALESCE(sum(sms_credits), 0) AS credits
                FROM tenants
                """);
        Map<String, Object> p = jdbc.queryForMap("""
                SELECT COALESCE(sum(amount) FILTER (WHERE payment_type = 'SAAS_SUBSCRIPTION' AND status = 'SUCCESS'
                                                     AND paid_at > now() - interval '30 days'), 0) AS collected,
                       count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND gateway <> 'CASH') AS p24,
                       count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND status = 'FAILED') AS f24
                FROM payments
                """);
        Map<String, Object> q = jdbc.queryForMap("""
                SELECT count(*) FILTER (WHERE queue_date = current_date) AS today, count(*) AS last30
                FROM queue_tickets WHERE queue_date >= current_date - 30
                """);
        Timestamp lastWebhook = jdbc.queryForObject("SELECT max(received_at) FROM webhook_events", Timestamp.class);

        BigDecimal mrr = props.plans().starterPrice().multiply(BigDecimal.valueOf(num(m, "starter_paying")))
                .add(props.plans().proPrice().multiply(BigDecimal.valueOf(num(m, "pro_paying"))));
        return new PlatformMetrics(num(m, "total"), num(m, "active"), num(m, "trial"), num(m, "suspended"),
                num(m, "pending"), mrr, (BigDecimal) p.get("collected"), num(q, "today"), num(q, "last30"),
                num(m, "credits"), broadcaster.connectionCount(), props.payment().gateway(), num(p, "p24"),
                num(p, "f24"), instant(lastWebhook));
    }

    @PatchMapping("/tenants/{id}/status")
    @Transactional
    public TenantSummary setStatus(@CurrentUser AuthPrincipal admin, @PathVariable UUID id,
                                   @Valid @RequestBody TenantStatusUpdate req) {
        Tenant t = load(id);
        SubscriptionStatus target = req.status();
        if (target == SubscriptionStatus.TRIAL && t.getTrialEndsAt().isBefore(Instant.now())) {
            t.setTrialEndsAt(Instant.now().plus(Duration.ofDays(props.trialDays())));
        }
        if (target == SubscriptionStatus.ACTIVE && (t.getCurrentPeriodEndsAt() == null
                || t.getCurrentPeriodEndsAt().isBefore(Instant.now()))) {
            t.setCurrentPeriodEndsAt(Instant.now().plus(Duration.ofDays(30)));
        }
        audit.record(t.getId(), admin.userId(), "SUPER_SET_STATUS", "tenant", t.getId(),
                Map.of("from", t.getSubscriptionStatus().name(), "to", target.name()));
        t.setSubscriptionStatus(target);
        return summary(t);
    }

    @PatchMapping("/tenants/{id}/plan")
    @Transactional
    public TenantSummary setPlan(@CurrentUser AuthPrincipal admin, @PathVariable UUID id, @Valid @RequestBody TenantPlanUpdate req) {
        Tenant t = load(id);
        audit.record(t.getId(), admin.userId(), "SUPER_SET_PLAN", "tenant", t.getId(), Map.of("plan", req.plan().name()));
        t.setSubscriptionPlan(req.plan());
        return summary(t);
    }

    @PostMapping("/tenants/{id}/extend-trial")
    @Transactional
    public TenantSummary extendTrial(@CurrentUser AuthPrincipal admin, @PathVariable UUID id, @Valid @RequestBody TrialExtension req) {
        Tenant t = load(id);
        Instant base = t.getTrialEndsAt().isAfter(Instant.now()) ? t.getTrialEndsAt() : Instant.now();
        t.setTrialEndsAt(base.plus(Duration.ofDays(req.days())));
        if (t.getSubscriptionStatus() == SubscriptionStatus.SUSPENDED || t.getSubscriptionStatus() == SubscriptionStatus.PENDING_APPROVAL) {
            t.setSubscriptionStatus(SubscriptionStatus.TRIAL);
        }
        audit.record(t.getId(), admin.userId(), "SUPER_EXTEND_TRIAL", "tenant", t.getId(), Map.of("days", req.days()));
        return summary(t);
    }

    @PostMapping("/tenants/{id}/credits")
    @Transactional
    public TenantSummary addCredits(@CurrentUser AuthPrincipal admin, @PathVariable UUID id, @Valid @RequestBody CreditTopUp req) {
        Tenant t = load(id);
        t.setSmsCredits(t.getSmsCredits() + req.credits());
        audit.record(t.getId(), admin.userId(), "SUPER_ADD_CREDITS", "tenant", t.getId(), Map.of("credits", req.credits()));
        return summary(t);
    }

    private Tenant load(UUID id) {
        return tenants.findById(id).orElseThrow(() -> ApiException.notFound("Tenant"));
    }

    private TenantSummary summary(Tenant t) {
        return new TenantSummary(t.getId(), t.getBusinessName(), t.getSlug(), t.getEmail(), t.getPhone(),
                t.getSubscriptionPlan().name(), t.getSubscriptionStatus().name(), t.getTrialEndsAt(),
                t.getCurrentPeriodEndsAt(), t.getSmsCredits(), t.getCreatedAt(), 0, 0);
    }

    private static long num(Map<String, Object> m, String k) {
        Object v = m.get(k);
        return v == null ? 0 : ((Number) v).longValue();
    }

    private static Instant instant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }
}
