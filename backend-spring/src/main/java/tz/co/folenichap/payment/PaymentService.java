package tz.co.folenichap.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.common.AuditService;
import tz.co.folenichap.common.PhoneNumbers;
import tz.co.folenichap.config.AppProperties;
import tz.co.folenichap.payment.PaymentGateway.StkPushRequest;
import tz.co.folenichap.payment.PaymentGateway.StkPushResult;
import tz.co.folenichap.queue.PaymentStatus;
import tz.co.folenichap.queue.QueueTicket;
import tz.co.folenichap.queue.QueueTicketRepository;
import tz.co.folenichap.queue.ServiceOffering;
import tz.co.folenichap.queue.ServiceRepository;
import tz.co.folenichap.queue.TicketService;
import tz.co.folenichap.tenant.SubscriptionPlan;
import tz.co.folenichap.tenant.SubscriptionStatus;
import tz.co.folenichap.tenant.Tenant;
import tz.co.folenichap.tenant.TenantRepository;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

/**
 * Payment orchestration. The slow network call to the gateway happens OUTSIDE any database
 * transaction: (1) record PENDING, commit; (2) push; (3) record the gateway's answer.
 * Settlement (webhook or mock) is idempotent and amount-checked.
 */
@Slf4j
@Service
public class PaymentService {

    private static final SecureRandom RANDOM = new SecureRandom();
    static final String TIMEOUT_REASON = "Timed out waiting for customer";

    private final PaymentRepository payments;
    private final QueueTicketRepository tickets;
    private final ServiceRepository services;
    private final TenantRepository tenants;
    private final TicketService ticketService;
    private final PaymentGateway gateway;
    private final WebhookSecurity webhookSecurity;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final AppProperties props;
    private final AuditService audit;
    private final TransactionTemplate tx;

    public PaymentService(PaymentRepository payments, QueueTicketRepository tickets, ServiceRepository services,
                          TenantRepository tenants, TicketService ticketService, PaymentGateway gateway,
                          WebhookSecurity webhookSecurity, JdbcTemplate jdbc, ObjectMapper mapper,
                          AppProperties props, AuditService audit, PlatformTransactionManager txManager) {
        this.payments = payments;
        this.tickets = tickets;
        this.services = services;
        this.tenants = tenants;
        this.ticketService = ticketService;
        this.gateway = gateway;
        this.webhookSecurity = webhookSecurity;
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.props = props;
        this.audit = audit;
        this.tx = new TransactionTemplate(txManager);
    }

    public record PushOutcome(boolean accepted, String reference, String message) {}

    // ------------------------------------------------------------------ booking fee

    public PushOutcome payForTicket(UUID ticketId, MobileProvider provider, String payerPhone) {
        Payment p = tx.execute(status -> {
            QueueTicket t = tickets.findById(ticketId).orElseThrow(() -> ApiException.notFound("Ticket"));
            if (t.getPaymentStatus().isSettled()) {
                throw ApiException.conflict("ALREADY_PAID", "This ticket is already paid");
            }
            if (!t.getStatus().isActive()) {
                throw ApiException.conflict("TICKET_CLOSED", "This ticket is no longer active");
            }
            Tenant tenant = tenants.findById(t.getTenantId()).orElseThrow();
            if (!tenant.effectivePlan().paymentsEnabled()) {
                throw ApiException.forbidden("PLAN_FEATURE", "Mobile money collection requires the Pro plan");
            }
            ServiceOffering s = services.findById(t.getServiceId()).orElseThrow();
            if (!s.hasFee()) {
                throw ApiException.badRequest("NO_FEE", "This service has no booking fee");
            }
            String msisdn = PhoneNumbers.normalize(payerPhone == null || payerPhone.isBlank() ? t.getCustomerPhone() : payerPhone);
            Payment pay = newPayment(t.getTenantId(), Payment.Type.BOOKING_FEE, "BF", provider, msisdn,
                    s.getFeeAmount(), s.getCurrency());
            pay.setTicketId(t.getId());
            payments.save(pay);
            return pay;
        });
        ticketService.updatePaymentStatus(ticketId, PaymentStatus.PENDING);
        return push(p, "Booking fee " + p.getExternalReference());
    }

    /** Reception records cash or waives the fee. */
    public void staffOverride(UUID tenantId, UUID userId, UUID ticketId, String action, String reason) {
        tx.executeWithoutResult(status -> {
            QueueTicket t = tickets.findByIdAndTenantId(ticketId, tenantId).orElseThrow(() -> ApiException.notFound("Ticket"));
            if (t.getPaymentStatus() == PaymentStatus.PAID) {
                throw ApiException.conflict("ALREADY_PAID", "This ticket is already paid");
            }
            if ("PAID_CASH".equals(action)) {
                ServiceOffering s = services.findByIdAndTenantId(t.getServiceId(), tenantId).orElseThrow();
                if (!s.hasFee()) {
                    throw ApiException.badRequest("NO_FEE", "This service has no fee");
                }
                Payment cash = newPayment(tenantId, Payment.Type.BOOKING_FEE, "CASH", MobileProvider.CASH, null,
                        s.getFeeAmount(), s.getCurrency());
                cash.setTicketId(ticketId);
                cash.setGateway("CASH");
                cash.setStatus(Payment.Status.SUCCESS);
                cash.setPaidAt(Instant.now());
                payments.save(cash);
            }
            audit.record(tenantId, userId, "PAYMENT_" + action, "ticket", ticketId,
                    reason == null ? Map.of() : Map.of("reason", reason));
        });
        ticketService.updatePaymentStatus(ticketId, "WAIVED".equals(action) ? PaymentStatus.WAIVED : PaymentStatus.PAID);
    }

    // ------------------------------------------------------------------ SaaS subscription

    public PushOutcome paySubscription(UUID tenantId, SubscriptionPlan plan, MobileProvider provider, String phone) {
        Payment p = tx.execute(status -> {
            BigDecimal price = plan == SubscriptionPlan.PRO ? props.plans().proPrice() : props.plans().starterPrice();
            Payment pay = newPayment(tenantId, Payment.Type.SAAS_SUBSCRIPTION, "SUB" + plan.name().charAt(0),
                    provider, PhoneNumbers.normalize(phone), price, "TZS");
            payments.save(pay);
            return pay;
        });
        return push(p, "FoleniChap " + plan.name() + " subscription");
    }

    // ------------------------------------------------------------------ webhook + settlement

    /**
     * Handles an AzamPay-style callback:
     * {"msisdn","amount","message","utilityref","operator","reference","transactionstatus","fspReferenceId"}
     */
    public void handleWebhook(String gatewayName, String rawBody, String signature, String urlToken, String sourceIp) {
        // Only the configured gateway may call back; anything else is not an endpoint we serve.
        if (gatewayName == null || !gatewayName.equalsIgnoreCase(gateway.name())) {
            throw ApiException.notFound("Webhook");
        }
        boolean valid = webhookSecurity.ipAllowed(sourceIp) && webhookSecurity.authentic(rawBody, signature, urlToken);
        JsonNode json;
        try {
            json = mapper.readTree(rawBody);
        } catch (Exception e) {
            throw ApiException.badRequest("BAD_PAYLOAD", "Invalid JSON");
        }
        String reference = text(json, "utilityref", "externalId", "external_reference");
        String txStatus = text(json, "transactionstatus", "status");
        // rejected callbacks get a unique key so a forged early call can never "use up" the real one
        String eventKey = !valid || reference == null
                ? "rejected:" + UUID.randomUUID()
                : reference + ":" + txStatus;

        int inserted = jdbc.update("""
                INSERT INTO webhook_events (gateway, event_key, payload, signature_valid, source_ip)
                VALUES (?, ?, CAST(? AS jsonb), ?, ?)
                ON CONFLICT (gateway, event_key) DO NOTHING
                """, gatewayName.toUpperCase(), eventKey, rawBody, valid, sourceIp);
        if (!valid) {
            log.warn("Rejected webhook from {} (signature/ip check failed) ref={}", sourceIp, reference);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_SIGNATURE", "Invalid webhook signature");
        }
        if (inserted == 0) {
            log.info("Duplicate webhook ignored: {}", eventKey);
            return;
        }
        if (reference == null) {
            markWebhook(gatewayName, eventKey, "missing reference");
            return;
        }
        boolean success = txStatus != null && (txStatus.equalsIgnoreCase("success") || txStatus.equalsIgnoreCase("successful"));
        BigDecimal amount;
        try {
            amount = json.hasNonNull("amount") ? new BigDecimal(json.get("amount").asText().trim()) : null;
        } catch (NumberFormatException e) {
            amount = null;
        }
        if (success && amount == null) {
            // never mark money as received without knowing how much was paid
            log.error("Success callback without a valid amount for {} - left pending for review", reference);
            markWebhook(gatewayName, eventKey, "success without amount: not settled");
            return;
        }
        String providerTxn = text(json, "reference", "fspReferenceId", "transactionId");
        String error = settle(reference, success, providerTxn, success ? null : text(json, "message"), amount);
        markWebhook(gatewayName, eventKey, error);
    }

    /** Idempotent settlement. Returns an error string (for the webhook log) or null. */
    public String settle(String reference, boolean success, String providerTxn, String reason, BigDecimal amount) {
        Payment settled = tx.execute(status -> {
            Payment p = payments.lockByReference(reference).orElse(null);
            if (p == null) {
                return null;
            }
            // A customer may approve the USSD prompt just after our 10-minute timeout. The gateway's
            // authenticated success callback is the source of truth, so it revives a timed-out payment.
            boolean lateSuccess = success && p.getStatus() == Payment.Status.FAILED && TIMEOUT_REASON.equals(p.getFailureReason());
            if (p.getStatus() != Payment.Status.PENDING && !lateSuccess) {
                return null;
            }
            if (lateSuccess) {
                log.warn("Late success callback for timed-out payment {} - marking as paid", reference);
            }
            if (success && amount != null && p.getAmount().compareTo(amount) != 0) {
                p.setStatus(Payment.Status.FAILED);
                p.setFailureReason("Amount mismatch: expected " + p.getAmount() + " got " + amount);
                log.error("Payment {} amount mismatch ({} vs {})", reference, p.getAmount(), amount);
                return p;
            }
            p.setStatus(success ? Payment.Status.SUCCESS : Payment.Status.FAILED);
            p.setProviderTransactionId(providerTxn);
            p.setFailureReason(reason);
            if (success) {
                p.setPaidAt(Instant.now());
                if (p.getPaymentType() == Payment.Type.SAAS_SUBSCRIPTION) {
                    activateSubscription(p);
                }
            }
            return p;
        });
        if (settled == null) {
            return "unknown or already settled";
        }
        if (settled.getTicketId() != null) {
            ticketService.updatePaymentStatus(settled.getTicketId(),
                    settled.getStatus() == Payment.Status.SUCCESS ? PaymentStatus.PAID : PaymentStatus.UNPAID);
        }
        return settled.getStatus() == Payment.Status.SUCCESS ? null : settled.getFailureReason();
    }

    /** STK pushes the customer never answered expire after 10 minutes. */
    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    public void expireStalePending() {
        payments.findByStatusAndCreatedAtBefore(Payment.Status.PENDING, Instant.now().minus(Duration.ofMinutes(10)))
                .forEach(p -> settle(p.getExternalReference(), false, null, TIMEOUT_REASON, null));
    }

    // ------------------------------------------------------------------ helpers

    private PushOutcome push(Payment p, String description) {
        StkPushResult r;
        try {
            r = gateway.initiate(new StkPushRequest(p.getExternalReference(), p.getMsisdn(), p.getAmount(),
                    p.getCurrency(), p.getProvider(), description));
        } catch (Exception e) {
            log.error("Gateway error for {}", p.getExternalReference(), e);
            r = new StkPushResult(false, null, "Gateway unavailable");
        }
        if (!r.accepted()) {
            settle(p.getExternalReference(), false, r.providerTransactionId(), r.message(), null);
            return new PushOutcome(false, p.getExternalReference(), r.message());
        }
        return new PushOutcome(true, p.getExternalReference(), r.message());
    }

    private void activateSubscription(Payment p) {
        Tenant t = tenants.findById(p.getTenantId()).orElseThrow();
        SubscriptionPlan plan = p.getExternalReference().startsWith("SUBP") ? SubscriptionPlan.PRO : SubscriptionPlan.STARTER;
        Instant base = t.getCurrentPeriodEndsAt() != null && t.getCurrentPeriodEndsAt().isAfter(Instant.now())
                ? t.getCurrentPeriodEndsAt() : Instant.now();
        t.setSubscriptionPlan(plan);
        t.setSubscriptionStatus(SubscriptionStatus.ACTIVE);
        t.setCurrentPeriodEndsAt(base.plus(Duration.ofDays(30)));
        if (plan == SubscriptionPlan.PRO) {
            t.setSmsCredits(t.getSmsCredits() + props.plans().proMonthlyCredits());
        }
        audit.record(t.getId(), null, "SUBSCRIPTION_PAID", "tenant", t.getId(),
                Map.of("plan", plan.name(), "amount", p.getAmount()));
    }

    private Payment newPayment(UUID tenantId, Payment.Type type, String prefix, MobileProvider provider, String msisdn,
                               BigDecimal amount, String currency) {
        byte[] b = new byte[6];
        RANDOM.nextBytes(b);
        Payment p = new Payment();
        p.setTenantId(tenantId);
        p.setPaymentType(type);
        p.setProvider(provider == null ? MobileProvider.detect(msisdn) : provider);
        p.setGateway(gateway.name());
        p.setMsisdn(msisdn);
        p.setAmount(amount);
        p.setCurrency(currency);
        p.setExternalReference(prefix + "-" + HexFormat.of().formatHex(b).toUpperCase());
        return p;
    }

    private void markWebhook(String gatewayName, String eventKey, String error) {
        jdbc.update("UPDATE webhook_events SET processed_at = now(), error = ? WHERE gateway = ? AND event_key = ?",
                error, gatewayName.toUpperCase(), eventKey);
    }

    private static String text(JsonNode n, String... keys) {
        for (String k : keys) {
            if (n.hasNonNull(k) && !n.get(k).asText().isBlank()) {
                return n.get(k).asText();
            }
        }
        return null;
    }
}
