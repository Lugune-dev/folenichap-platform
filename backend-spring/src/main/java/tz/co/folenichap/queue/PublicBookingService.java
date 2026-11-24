package tz.co.folenichap.queue;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.payment.MobileProvider;
import tz.co.folenichap.payment.PaymentService;
import tz.co.folenichap.payment.PaymentService.PushOutcome;
import tz.co.folenichap.queue.QueueDtos.CreateTicketRequest;
import tz.co.folenichap.queue.QueueDtos.PublicBranchView;
import tz.co.folenichap.queue.QueueDtos.PublicServiceView;
import tz.co.folenichap.queue.QueueDtos.PublicTenantView;
import tz.co.folenichap.queue.QueueDtos.TicketStatusView;
import tz.co.folenichap.tenant.Branch;
import tz.co.folenichap.tenant.BranchRepository;
import tz.co.folenichap.tenant.Tenant;
import tz.co.folenichap.tenant.TenantGuard;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Zero-app customer journey: profile -> ticket -> optional STK push -> live tracking. */
@Service
@RequiredArgsConstructor
public class PublicBookingService {

    private final TenantGuard tenantGuard;
    private final BranchRepository branches;
    private final ServiceRepository services;
    private final QueueTicketRepository tickets;
    private final TicketService ticketService;
    private final PaymentService paymentService;
    private final WaitEstimator estimator;

    @Transactional(readOnly = true)
    public PublicTenantView profile(String slug, UUID branchId) {
        Tenant t = tenantGuard.loadBySlug(slug);
        List<Branch> active = branches.findByTenantIdAndActiveTrueOrderByMainDescNameAsc(t.getId());
        Branch branch = branchId == null
                ? active.stream().findFirst().orElseThrow(() -> ApiException.notFound("Branch"))
                : active.stream().filter(b -> b.getId().equals(branchId)).findFirst()
                        .orElseThrow(() -> ApiException.notFound("Branch"));
        LocalDate today = LocalDate.now(t.zone());
        List<QueueTicket> waiting = tickets.findByTenantIdAndBranchIdAndQueueDateAndStatusOrderByJoinedAtAsc(
                t.getId(), branch.getId(), today, TicketStatus.WAITING);
        Map<UUID, Long> byService = waiting.stream().collect(Collectors.groupingBy(QueueTicket::getServiceId, Collectors.counting()));
        long agents = tickets.countActiveAgents(branch.getId(), today, Instant.now().minus(Duration.ofMinutes(60)));
        boolean payments = t.effectivePlan().paymentsEnabled();
        List<PublicServiceView> svc = services.findByTenantIdAndActiveTrueOrderBySortOrderAscNameAsc(t.getId()).stream()
                .map(s -> {
                    long w = byService.getOrDefault(s.getId(), 0L);
                    return new PublicServiceView(s.getId(), s.getName(), s.getNameSw(), s.getDescription(),
                            s.getTicketPrefix(), s.getAvgDurationMinutes(), s.getFeeAmount(), s.getCurrency(),
                            payments && s.isRequireUpfrontPayment(), w,
                            estimator.estimateMinutes(w, s.getAvgDurationMinutes(), agents), s.isAllowAppointments());
                }).toList();
        boolean operational = t.getSubscriptionStatus().canOperate();
        boolean accepting = operational && TicketService.closedReason(branch, t) == null;
        boolean appointments = operational && svc.stream().anyMatch(PublicServiceView::allowAppointments);
        return new PublicTenantView(t.getSlug(), t.getBusinessName(), t.getLogoUrl(), t.getGreetingEn(),
                t.getGreetingSw(), t.getDefaultLanguage(), accepting, payments, branch.getId(),
                active.stream().map(b -> new PublicBranchView(b.getId(), b.getName(), b.getAddress(), b.isMain())).toList(),
                svc, waiting.size(), appointments);
    }

    public TicketStatusView book(String slug, CreateTicketRequest req) {
        Tenant tenant = tenantGuard.loadBySlug(slug);
        tenantGuard.requireOperational(tenant);
        Branch branch = tenantGuard.resolveBranch(tenant.getId(), req.branchId(), null);
        String closed = TicketService.closedReason(branch, tenant);
        if (closed != null) {
            throw ApiException.conflict(closed, "The branch is closed right now");
        }
        ServiceOffering service = services.findByIdAndTenantId(req.serviceId(), tenant.getId())
                .filter(ServiceOffering::isActive)
                .orElseThrow(() -> ApiException.notFound("Service"));
        if (req.customerPhone() == null || req.customerPhone().isBlank()) {
            throw ApiException.badRequest("INVALID_PHONE", "Phone number is required");
        }

        QueueTicket ticket = ticketService.issue(tenant, branch, service, req.customerName(), req.customerPhone(),
                req.language(), TicketSource.QR, null);

        String paymentMessage = null;
        boolean wantsPay = service.hasFee() && tenant.effectivePlan().paymentsEnabled()
                && (service.isRequireUpfrontPayment() || Boolean.TRUE.equals(req.payNow()))
                && !ticket.getPaymentStatus().isSettled() && ticket.getPaymentStatus() != PaymentStatus.PENDING;
        if (wantsPay) {
            MobileProvider provider = req.paymentProvider() == null
                    ? MobileProvider.detect(ticket.getCustomerPhone())
                    : MobileProvider.valueOf(req.paymentProvider());
            PushOutcome outcome = paymentService.payForTicket(ticket.getId(), provider, null);
            paymentMessage = outcome.accepted() ? "PUSH_SENT" : "PUSH_FAILED";
        }
        return status(ticket.getTrackingToken(), paymentMessage);
    }

    public TicketStatusView pay(String token, String provider, String payerPhone) {
        QueueTicket t = tickets.findByTrackingToken(token).orElseThrow(() -> ApiException.notFound("Ticket"));
        PushOutcome outcome = paymentService.payForTicket(t.getId(), MobileProvider.valueOf(provider), payerPhone);
        return status(token, outcome.accepted() ? "PUSH_SENT" : "PUSH_FAILED");
    }

    @Transactional(readOnly = true)
    public TicketStatusView status(String token, String paymentMessage) {
        QueueTicket t = tickets.findByTrackingToken(token).orElseThrow(() -> ApiException.notFound("Ticket"));
        Tenant tenant = tenantGuard.load(t.getTenantId());
        ServiceOffering s = services.findById(t.getServiceId()).orElseThrow();
        Branch b = branches.findById(t.getBranchId()).orElseThrow();
        long ahead = t.getStatus() == TicketStatus.WAITING
                ? tickets.countAhead(t.getTenantId(), t.getBranchId(), t.getServiceId(), t.getQueueDate(), t.getJoinedAt(), t.getSequenceNo())
                : 0;
        long agents = tickets.countActiveAgents(t.getBranchId(), t.getQueueDate(), Instant.now().minus(Duration.ofMinutes(60)));
        return new TicketStatusView(t.getTrackingToken(), t.getTicketNumber(), t.getStatus().name(),
                t.getPaymentStatus().name(), s.getName(), s.getNameSw(), tenant.getBusinessName(), tenant.getSlug(),
                b.getId(), b.getName(), ahead,
                t.getStatus() == TicketStatus.WAITING ? estimator.estimateMinutes(ahead, s.getAvgDurationMinutes(), agents) : 0,
                t.getCounterLabel(), t.getJoinedAt(), t.getCalledAt(), s.getFeeAmount(), s.getCurrency(),
                s.isRequireUpfrontPayment(), paymentMessage);
    }
}
