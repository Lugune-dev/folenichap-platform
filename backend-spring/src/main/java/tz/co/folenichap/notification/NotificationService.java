package tz.co.folenichap.notification;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tz.co.folenichap.appointment.Appointment;
import tz.co.folenichap.appointment.AppointmentRepository;
import tz.co.folenichap.config.AppProperties;
import tz.co.folenichap.notification.MessageTemplates.Message;
import tz.co.folenichap.queue.QueueTicket;
import tz.co.folenichap.queue.QueueTicketRepository;
import tz.co.folenichap.queue.ServiceOffering;
import tz.co.folenichap.queue.ServiceRepository;
import tz.co.folenichap.queue.TicketStatus;
import tz.co.folenichap.queue.WaitEstimator;
import tz.co.folenichap.tenant.Tenant;
import tz.co.folenichap.tenant.TenantRepository;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * WhatsApp-first delivery with automatic SMS fallback. Each delivered message consumes one
 * credit from the tenant's balance (atomic decrement, so the balance never goes negative).
 * Invoked from the async after-commit listener, so it never slows down the staff desk.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final QueueTicketRepository tickets;
    private final ServiceRepository services;
    private final TenantRepository tenants;
    private final WaitEstimator estimator;
    private final WhatsAppCloudClient whatsApp;
    private final BeemSmsClient sms;
    private final JdbcTemplate jdbc;
    private final AppProperties props;
    private final AppointmentRepository appointments;

    public void ticketBooked(UUID ticketId) {
        tickets.findById(ticketId).ifPresent(t -> {
            Tenant tenant = tenants.findById(t.getTenantId()).orElseThrow();
            ServiceOffering s = services.findById(t.getServiceId()).orElseThrow();
            long ahead = tickets.countAhead(t.getTenantId(), t.getBranchId(), t.getServiceId(), t.getQueueDate(),
                    t.getJoinedAt(), t.getSequenceNo());
            long agents = tickets.countActiveAgents(t.getBranchId(), t.getQueueDate(),
                    Instant.now().minus(Duration.ofMinutes(60)));
            String url = props.publicBaseUrl() + "/t/" + t.getTrackingToken();
            Message m = MessageTemplates.booked(t.getCustomerLanguage(), firstName(t), t.getTicketNumber(),
                    tenant.getBusinessName(), ahead, estimator.estimateMinutes(ahead, s.getAvgDurationMinutes(), agents), url);
            deliver(tenant, t, m);
        });
    }

    public void appointmentBooked(UUID appointmentId) {
        appointments.findById(appointmentId).ifPresent(a -> {
            Tenant tenant = tenants.findById(a.getTenantId()).orElseThrow();
            ServiceOffering s = services.findById(a.getServiceId()).orElseThrow();
            deliver(tenant, null, a.getCustomerPhone(), a.getCustomerLanguage(),
                    MessageTemplates.appointmentBooked(a.getCustomerLanguage(), firstName(a.getCustomerName()),
                            tenant.getBusinessName(), serviceName(s, a.getCustomerLanguage()),
                            ZonedDateTime.ofInstant(a.getStartAt(), tenant.zone()), manageUrl(a)));
        });
    }

    public void appointmentReminder(UUID appointmentId) {
        appointments.findById(appointmentId).ifPresent(a -> {
            Tenant tenant = tenants.findById(a.getTenantId()).orElseThrow();
            ServiceOffering s = services.findById(a.getServiceId()).orElseThrow();
            deliver(tenant, null, a.getCustomerPhone(), a.getCustomerLanguage(),
                    MessageTemplates.appointmentReminder(a.getCustomerLanguage(), firstName(a.getCustomerName()),
                            tenant.getBusinessName(), serviceName(s, a.getCustomerLanguage()),
                            ZonedDateTime.ofInstant(a.getStartAt(), tenant.zone()), manageUrl(a)));
        });
    }

    /**
     * Platform message (e.g. a password reset code): paid by the platform, so it never uses the
     * tenant's message credits and is sent on any plan.
     *
     * @return true when at least one channel accepted the message
     */
    public boolean sendPlatformMessage(UUID tenantId, String to, String lang, Message m) {
        if (!whatsApp.isEnabled() && !sms.isEnabled()) {
            log.info("[notification:dev] to={} {}", to, m.text());
            return false;
        }
        String template = whatsApp.isEnabled() ? whatsApp.templateName(m.templateKey()) : null;
        if (template != null) {
            ChannelResult wa = whatsApp.sendTemplate(to, template, lang, m.params());
            if (tenantId != null) {
                record(tenantId, null, "WHATSAPP", m.templateKey(), to, wa.success() ? "SENT" : "FAILED",
                        wa.providerMessageId(), wa.error());
            }
            if (wa.success()) {
                return true;
            }
        }
        if (sms.isEnabled()) {
            ChannelResult r = sms.send(to, m.text());
            if (tenantId != null) {
                record(tenantId, null, "SMS", m.templateKey(), to, r.success() ? "SENT" : "FAILED",
                        r.providerMessageId(), r.error());
            }
            return r.success();
        }
        return false;
    }

    public void ticketCalled(UUID ticketId) {
        tickets.findById(ticketId).ifPresent(t -> {
            Tenant tenant = tenants.findById(t.getTenantId()).orElseThrow();
            String counter = t.getCounterLabel() == null ? ("en".equals(t.getCustomerLanguage()) ? "the counter" : "dirishani") : t.getCounterLabel();
            deliver(tenant, t, MessageTemplates.called(t.getCustomerLanguage(), firstName(t), t.getTicketNumber(),
                    counter, tenant.getBusinessName()));
        });
    }

    /** Alerts customers who are now within N places of being served (once per ticket). */
    public void notifyNearTurn(UUID tenantId, UUID branchId) {
        Tenant tenant = tenants.findById(tenantId).orElseThrow();
        if (!tenant.effectivePlan().notificationsEnabled()) {
            return;
        }
        int threshold = props.notification().nearTurnPosition();
        LocalDate today = LocalDate.now(tenant.zone());
        List<QueueTicket> waiting = tickets.findByTenantIdAndBranchIdAndQueueDateAndStatusOrderByJoinedAtAsc(
                tenantId, branchId, today, TicketStatus.WAITING);
        Map<UUID, List<QueueTicket>> byService = waiting.stream()
                .collect(Collectors.groupingBy(QueueTicket::getServiceId));
        byService.values().forEach(queue -> {
            for (int ahead = 0; ahead < queue.size() && ahead <= threshold; ahead++) {
                QueueTicket t = queue.get(ahead);
                if (t.isNearTurnNotified() || t.getCustomerPhone().isBlank()) {
                    continue;
                }
                // claim atomically so concurrent events never double-send
                int claimed = jdbc.update(
                        "UPDATE queue_tickets SET near_turn_notified = TRUE WHERE id = ? AND near_turn_notified = FALSE",
                        t.getId());
                if (claimed == 1 && ahead > 0) {
                    deliver(tenant, t, MessageTemplates.nearTurn(t.getCustomerLanguage(), firstName(t),
                            t.getTicketNumber(), tenant.getBusinessName(), ahead));
                }
            }
        });
    }

    private void deliver(Tenant tenant, QueueTicket t, Message m) {
        deliver(tenant, t.getId(), t.getCustomerPhone(), t.getCustomerLanguage(), m);
    }

    private void deliver(Tenant tenant, UUID ticketId, String to, String lang, Message m) {
        if (to == null || to.isBlank()) {
            return;
        }
        if (!tenant.effectivePlan().notificationsEnabled()) {
            record(tenant.getId(), ticketId, "LOG", m.templateKey(), to, "SKIPPED", null, "Plan has no alerts");
            return;
        }
        if (!whatsApp.isEnabled() && !sms.isEnabled()) {
            log.info("[notification:dev] to={} {}", to, m.text());
            record(tenant.getId(), ticketId, "LOG", m.templateKey(), to, "SKIPPED", null, "No channel configured");
            return;
        }
        int debited = jdbc.update("UPDATE tenants SET sms_credits = sms_credits - 1 WHERE id = ? AND sms_credits > 0",
                tenant.getId());
        if (debited == 0) {
            record(tenant.getId(), ticketId, "LOG", m.templateKey(), to, "SKIPPED", null, "Out of message credits");
            return;
        }
        String template = whatsApp.isEnabled() ? whatsApp.templateName(m.templateKey()) : null;
        if (template != null) {
            ChannelResult wa = whatsApp.sendTemplate(to, template, lang, m.params());
            record(tenant.getId(), ticketId, "WHATSAPP", m.templateKey(), to, wa.success() ? "SENT" : "FAILED",
                    wa.providerMessageId(), wa.error());
            if (wa.success()) {
                return;
            }
        }
        if (sms.isEnabled()) {
            ChannelResult r = sms.send(to, m.text());
            record(tenant.getId(), ticketId, "SMS", m.templateKey(), to, r.success() ? "SENT" : "FAILED",
                    r.providerMessageId(), r.error());
            if (r.success()) {
                return;
            }
        }
        // every channel failed: refund the credit
        jdbc.update("UPDATE tenants SET sms_credits = sms_credits + 1 WHERE id = ?", tenant.getId());
    }

    private void record(UUID tenantId, UUID ticketId, String channel, String template, String to, String status,
                     String providerId, String error) {
        try {
            jdbc.update("""
                    INSERT INTO notification_log (tenant_id, ticket_id, channel, template, recipient, status,
                                                  provider_message_id, error)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, tenantId, ticketId, channel, template, to, status, providerId, error);
        } catch (RuntimeException e) {
            log.warn("notification_log insert failed: {}", e.getMessage());
        }
    }

    private String manageUrl(Appointment a) {
        return props.publicBaseUrl() + "/a/" + a.getManageToken();
    }

    private static String serviceName(ServiceOffering s, String lang) {
        return !"en".equals(lang) && s.getNameSw() != null && !s.getNameSw().isBlank() ? s.getNameSw() : s.getName();
    }

    private static String firstName(QueueTicket t) {
        return firstName(t.getCustomerName());
    }

    private static String firstName(String name) {
        String n = name.trim();
        int sp = n.indexOf(' ');
        return sp > 0 ? n.substring(0, sp) : n;
    }
}
