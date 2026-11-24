package tz.co.folenichap.queue;

import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.common.AuditService;
import tz.co.folenichap.common.PhoneNumbers;
import tz.co.folenichap.queue.QueueChangedEvent.Type;
import tz.co.folenichap.queue.QueueDtos.CallNextRequest;
import tz.co.folenichap.queue.QueueDtos.StaffTicketView;
import tz.co.folenichap.queue.QueueDtos.TodayQueueView;
import tz.co.folenichap.queue.QueueDtos.WalkInRequest;
import tz.co.folenichap.security.AuthPrincipal;
import tz.co.folenichap.tenant.Branch;
import tz.co.folenichap.tenant.Tenant;
import tz.co.folenichap.tenant.TenantGuard;

import java.security.SecureRandom;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** All queue state changes go through here, so every change emits exactly one event. */
@Service
@RequiredArgsConstructor
public class TicketService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final QueueTicketRepository tickets;
    private final ServiceRepository services;
    private final TicketSequenceDao sequences;
    private final TenantGuard tenantGuard;
    private final ApplicationEventPublisher events;
    private final AuditService audit;

    // ------------------------------------------------------------------ creation

    /** Shared by public QR booking and reception walk-ins. */
    @Transactional
    public QueueTicket issue(Tenant tenant, Branch branch, ServiceOffering service, String name, String phone,
                             String language, TicketSource source, String notes) {
        return issue(tenant, branch, service, name, phone, language, source, notes, null);
    }

    /**
     * @param queuePosition the moment that decides the ticket's place in the queue (ordering is by
     *                      {@code joined_at}). Null means "now". Appointment check-ins pass their slot
     *                      start, so a booked customer is not overtaken by walk-ins who came later.
     */
    @Transactional
    public QueueTicket issue(Tenant tenant, Branch branch, ServiceOffering service, String name, String phone,
                             String language, TicketSource source, String notes, Instant queuePosition) {
        if (!service.isActive() || !service.getTenantId().equals(tenant.getId())) {
            throw ApiException.notFound("Service");
        }
        LocalDate today = LocalDate.now(tenant.zone());
        String normalizedPhone = phone == null || phone.isBlank() ? "" : PhoneNumbers.normalize(phone);

        // idempotency: same phone + same service + still active today => return existing ticket
        if (!normalizedPhone.isEmpty()) {
            Optional<QueueTicket> existing = tickets
                    .findFirstByTenantIdAndServiceIdAndBranchIdAndQueueDateAndCustomerPhoneAndStatusIn(
                            tenant.getId(), service.getId(), branch.getId(), today, normalizedPhone,
                            EnumSet.of(TicketStatus.WAITING, TicketStatus.CALLED, TicketStatus.SERVING));
            if (existing.isPresent()) {
                return existing.get();
            }
        }

        int seq = sequences.next(branch.getId(), service.getId(), today);
        QueueTicket t = new QueueTicket();
        t.setTenantId(tenant.getId());
        t.setBranchId(branch.getId());
        t.setServiceId(service.getId());
        t.setSequenceNo(seq);
        t.setTicketNumber(service.getTicketPrefix() + "-" + String.format("%03d", seq));
        t.setTrackingToken(newTrackingToken());
        t.setCustomerName(name.trim());
        t.setCustomerPhone(normalizedPhone);
        t.setCustomerLanguage(language == null ? tenant.getDefaultLanguage() : language);
        t.setSource(source);
        t.setQueueDate(today);
        Instant now = Instant.now();
        t.setJoinedAt(queuePosition != null && queuePosition.isBefore(now) ? queuePosition : now);
        t.setNotes(notes);
        t.setPaymentStatus(PaymentStatus.UNPAID);
        tickets.save(t);
        events.publishEvent(new QueueChangedEvent(tenant.getId(), branch.getId(), t.getId(), Type.CREATED));
        return t;
    }

    @Transactional
    public StaffTicketView walkIn(AuthPrincipal user, WalkInRequest req) {
        UUID tenantId = user.requireTenant();
        Tenant tenant = tenantGuard.requireOperational(tenantId);
        Branch branch = tenantGuard.resolveBranch(tenantId, req.branchId(), user.branchId());
        ServiceOffering service = services.findByIdAndTenantId(req.serviceId(), tenantId)
                .orElseThrow(() -> ApiException.notFound("Service"));
        QueueTicket t = issue(tenant, branch, service, req.customerName(), req.customerPhone(), req.language(),
                TicketSource.WALK_IN, req.notes());
        audit.record(tenantId, user.userId(), "TICKET_WALK_IN", "ticket", t.getId(), Map.of("number", t.getTicketNumber()));
        return toView(t, service);
    }

    // ------------------------------------------------------------------ staff desk

    @Transactional(readOnly = true)
    public TodayQueueView today(AuthPrincipal user, UUID branchId) {
        UUID tenantId = user.requireTenant();
        Tenant tenant = tenantGuard.load(tenantId);
        Branch branch = tenantGuard.resolveBranch(tenantId, branchId, user.branchId());
        LocalDate today = LocalDate.now(tenant.zone());
        Map<UUID, ServiceOffering> svc = services.findByTenantIdOrderBySortOrderAscNameAsc(tenantId).stream()
                .collect(Collectors.toMap(ServiceOffering::getId, Function.identity()));
        List<QueueTicket> all = tickets.findByTenantIdAndBranchIdAndQueueDateOrderByJoinedAtAsc(tenantId, branch.getId(), today);

        Map<TicketStatus, List<StaffTicketView>> grouped = all.stream()
                .collect(Collectors.groupingBy(QueueTicket::getStatus,
                        Collectors.mapping(t -> toView(t, svc.get(t.getServiceId())), Collectors.toList())));
        List<StaffTicketView> completed = new ArrayList<>(grouped.getOrDefault(TicketStatus.COMPLETED, List.of()));
        completed.sort((a, b) -> compareDesc(a.completedAt(), b.completedAt()));
        return new TodayQueueView(branch.getId(), today.toString(),
                grouped.getOrDefault(TicketStatus.WAITING, List.of()),
                grouped.getOrDefault(TicketStatus.CALLED, List.of()),
                grouped.getOrDefault(TicketStatus.SERVING, List.of()),
                completed,
                grouped.getOrDefault(TicketStatus.NO_SHOW, List.of()),
                grouped.getOrDefault(TicketStatus.CANCELLED, List.of()));
    }

    @Transactional
    public StaffTicketView callNext(AuthPrincipal user, CallNextRequest req) {
        UUID tenantId = user.requireTenant();
        Tenant tenant = tenantGuard.requireOperational(tenantId);
        Branch branch = tenantGuard.resolveBranch(tenantId, req == null ? null : req.branchId(), user.branchId());
        LocalDate today = LocalDate.now(tenant.zone());
        List<UUID> serviceIds = req == null ? null : req.serviceIds();
        Optional<QueueTicket> next = (serviceIds == null || serviceIds.isEmpty())
                ? tickets.lockNextWaiting(tenantId, branch.getId(), today)
                : tickets.lockNextWaitingForServices(tenantId, branch.getId(), today, serviceIds);
        QueueTicket t = next.orElseThrow(() -> ApiException.notFound("Waiting customer"));
        return markCalled(user, t, req == null ? null : req.counterLabel(), false);
    }

    @Transactional
    public StaffTicketView call(AuthPrincipal user, UUID ticketId, String counterLabel) {
        QueueTicket t = load(user, ticketId);
        if (t.getStatus() != TicketStatus.WAITING) {
            throw ApiException.conflict("INVALID_TRANSITION", "Only waiting tickets can be called");
        }
        return markCalled(user, t, counterLabel, false);
    }

    @Transactional
    public StaffTicketView recall(AuthPrincipal user, UUID ticketId) {
        QueueTicket t = load(user, ticketId);
        if (t.getStatus() != TicketStatus.CALLED) {
            throw ApiException.conflict("INVALID_TRANSITION", "Only called tickets can be recalled");
        }
        return markCalled(user, t, t.getCounterLabel(), true);
    }

    @Transactional
    public StaffTicketView start(AuthPrincipal user, UUID ticketId) {
        QueueTicket t = load(user, ticketId);
        ServiceOffering s = serviceOf(t);
        if (s.isRequireUpfrontPayment() && !t.getPaymentStatus().isSettled()) {
            throw ApiException.paymentRequired("PAYMENT_REQUIRED",
                    "Ticket " + t.getTicketNumber() + " has not paid the booking fee (status " + t.getPaymentStatus() + ")");
        }
        if (t.getStatus() == TicketStatus.WAITING) {
            // allow starting directly from the waiting list (single-agent shops)
            t.transitionTo(TicketStatus.CALLED);
            stampCall(user, t, null);
        }
        t.transitionTo(TicketStatus.SERVING);
        t.setServiceStartedAt(Instant.now());
        if (t.getServedByUserId() == null) {
            t.setServedByUserId(user.userId());
        }
        publish(t, Type.STARTED);
        return toView(t, s);
    }

    @Transactional
    public StaffTicketView complete(AuthPrincipal user, UUID ticketId) {
        QueueTicket t = load(user, ticketId);
        t.transitionTo(TicketStatus.COMPLETED);
        Instant now = Instant.now();
        t.setCompletedAt(now);
        if (t.getServiceStartedAt() == null) {
            t.setServiceStartedAt(t.getCalledAt() != null ? t.getCalledAt() : now);
        }
        publish(t, Type.COMPLETED);
        return toView(t, serviceOf(t));
    }

    @Transactional
    public StaffTicketView noShow(AuthPrincipal user, UUID ticketId) {
        QueueTicket t = load(user, ticketId);
        t.transitionTo(TicketStatus.NO_SHOW);
        publish(t, Type.NO_SHOW);
        return toView(t, serviceOf(t));
    }

    /** Put a NO_SHOW (late arrival) or CALLED ticket back into the waiting list. Keeps original position. */
    @Transactional
    public StaffTicketView requeue(AuthPrincipal user, UUID ticketId) {
        QueueTicket t = load(user, ticketId);
        t.transitionTo(TicketStatus.WAITING);
        t.setCalledAt(null);
        t.setCounterLabel(null);
        t.setServedByUserId(null);
        publish(t, Type.REQUEUED);
        return toView(t, serviceOf(t));
    }

    @Transactional
    public void cancelByCustomer(String trackingToken) {
        QueueTicket t = tickets.findByTrackingToken(trackingToken).orElseThrow(() -> ApiException.notFound("Ticket"));
        if (t.getStatus() != TicketStatus.WAITING) {
            throw ApiException.conflict("INVALID_TRANSITION", "Only waiting tickets can be cancelled");
        }
        t.transitionTo(TicketStatus.CANCELLED);
        publish(t, Type.CANCELLED);
    }

    @Transactional
    public void updatePaymentStatus(UUID ticketId, PaymentStatus status) {
        tickets.findById(ticketId).ifPresent(t -> {
            PaymentStatus current = t.getPaymentStatus();
            if (current == status || current == PaymentStatus.PAID
                    || (current == PaymentStatus.WAIVED && status != PaymentStatus.PAID)) {
                return; // never downgrade a settled ticket
            }
            t.setPaymentStatus(status);
            publish(t, Type.PAYMENT_UPDATED);
        });
    }

    // ------------------------------------------------------------------ helpers

    private StaffTicketView markCalled(AuthPrincipal user, QueueTicket t, String counterLabel, boolean recall) {
        t.transitionTo(TicketStatus.CALLED);
        stampCall(user, t, counterLabel);
        if (recall) {
            t.setRecallCount(t.getRecallCount() + 1);
        }
        publish(t, recall ? Type.RECALLED : Type.CALLED);
        audit.record(t.getTenantId(), user.userId(), recall ? "TICKET_RECALLED" : "TICKET_CALLED", "ticket",
                t.getId(), Map.of("number", t.getTicketNumber()));
        return toView(t, serviceOf(t));
    }

    private void stampCall(AuthPrincipal user, QueueTicket t, String counterLabel) {
        t.setCalledAt(Instant.now());
        t.setServedByUserId(user.userId());
        if (counterLabel != null && !counterLabel.isBlank()) {
            t.setCounterLabel(counterLabel.trim());
        } else if (t.getCounterLabel() == null) {
            t.setCounterLabel(user.fullName());
        }
    }

    private QueueTicket load(AuthPrincipal user, UUID ticketId) {
        UUID tenantId = user.requireTenant();
        QueueTicket t = tickets.findByIdAndTenantId(ticketId, tenantId).orElseThrow(() -> ApiException.notFound("Ticket"));
        tenantGuard.requireOperational(tenantId);
        return t;
    }

    private ServiceOffering serviceOf(QueueTicket t) {
        return services.findByIdAndTenantId(t.getServiceId(), t.getTenantId())
                .orElseThrow(() -> ApiException.notFound("Service"));
    }

    private void publish(QueueTicket t, Type type) {
        events.publishEvent(new QueueChangedEvent(t.getTenantId(), t.getBranchId(), t.getId(), type));
    }

    public static StaffTicketView toView(QueueTicket t, ServiceOffering s) {
        return new StaffTicketView(t.getId(), t.getTicketNumber(), t.getStatus().name(), t.getPaymentStatus().name(),
                t.getServiceId(), s == null ? null : s.getName(), t.getCustomerName(), t.getCustomerPhone(),
                t.getCustomerLanguage(), t.getSource().name(), t.getCounterLabel(), t.getServedByUserId(),
                t.getJoinedAt(), t.getCalledAt(), t.getServiceStartedAt(), t.getCompletedAt(), t.getRecallCount(),
                s != null && s.isRequireUpfrontPayment(), s == null ? null : s.getFeeAmount(), t.getVersion());
    }

    /** Returns null when open, or a reason code when outside configured operating hours. */
    public static String closedReason(Branch branch, Tenant tenant) {
        Map<String, Map<String, String>> hours = branch.getOperatingHours();
        if (hours == null || hours.isEmpty()) {
            return null; // hours not configured => always open
        }
        ZonedDateTime now = ZonedDateTime.now(tenant.zone());
        DayOfWeek dow = now.getDayOfWeek();
        String key = dow.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).toLowerCase(Locale.ROOT); // mon, tue...
        Map<String, String> day = hours.get(key);
        if (day == null || day.get("open") == null || day.get("close") == null) {
            return "CLOSED_TODAY";
        }
        LocalTime t = now.toLocalTime();
        if (t.isBefore(LocalTime.parse(day.get("open"))) || t.isAfter(LocalTime.parse(day.get("close")))) {
            return "OUTSIDE_HOURS";
        }
        return null;
    }

    private static String newTrackingToken() {
        byte[] b = new byte[12];
        RANDOM.nextBytes(b);
        return HexFormat.of().formatHex(b); // 24 hex chars
    }

    private static int compareDesc(Instant a, Instant b) {
        if (a == null) return 1;
        if (b == null) return -1;
        return b.compareTo(a);
    }
}
