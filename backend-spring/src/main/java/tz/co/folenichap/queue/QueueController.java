package tz.co.folenichap.queue;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.payment.PaymentService;
import tz.co.folenichap.queue.QueueDtos.CallNextRequest;
import tz.co.folenichap.queue.QueueDtos.CallRequest;
import tz.co.folenichap.queue.QueueDtos.CounterRequest;
import tz.co.folenichap.queue.QueueDtos.PaymentOverrideRequest;
import tz.co.folenichap.queue.QueueDtos.ServiceView;
import tz.co.folenichap.queue.QueueDtos.StaffTicketView;
import tz.co.folenichap.queue.QueueDtos.TodayQueueView;
import tz.co.folenichap.queue.QueueDtos.WalkInRequest;
import tz.co.folenichap.security.AuthPrincipal;
import tz.co.folenichap.security.CurrentUser;
import tz.co.folenichap.user.UserRepository;

import java.util.List;
import java.util.UUID;

/** Reception & service-agent queue control panel. */
@RestController
@RequestMapping("/api/v1/queue")
@RequiredArgsConstructor
public class QueueController {

    private final TicketService ticketService;
    private final PaymentService paymentService;
    private final ServiceRepository services;
    private final UserRepository users;

    /** Today's tickets grouped by WAITING, CALLED, SERVING, COMPLETED, NO_SHOW. */
    @GetMapping("/today")
    public TodayQueueView today(@CurrentUser AuthPrincipal user, @RequestParam(required = false) UUID branchId) {
        return ticketService.today(user, branchId);
    }

    @GetMapping("/services")
    public List<ServiceView> services(@CurrentUser AuthPrincipal user) {
        return services.findByTenantIdAndActiveTrueOrderBySortOrderAscNameAsc(user.requireTenant())
                .stream().map(ServiceView::of).toList();
    }

    @PostMapping("/call-next")
    public StaffTicketView callNext(@CurrentUser AuthPrincipal user, @Valid @RequestBody(required = false) CallNextRequest req) {
        return ticketService.callNext(user, req);
    }

    /** Calls a specific customer, broadcasts SSE and sends WhatsApp/SMS alert. */
    @PatchMapping("/tickets/{id}/call")
    public StaffTicketView call(@CurrentUser AuthPrincipal user, @PathVariable UUID id,
                                @Valid @RequestBody(required = false) CallRequest req) {
        return ticketService.call(user, id, req == null ? null : req.counterLabel());
    }

    @PatchMapping("/tickets/{id}/recall")
    public StaffTicketView recall(@CurrentUser AuthPrincipal user, @PathVariable UUID id) {
        return ticketService.recall(user, id);
    }

    @PatchMapping("/tickets/{id}/start")
    public StaffTicketView start(@CurrentUser AuthPrincipal user, @PathVariable UUID id) {
        return ticketService.start(user, id);
    }

    /** Marks service finished and logs actual service duration. */
    @PatchMapping("/tickets/{id}/complete")
    public StaffTicketView complete(@CurrentUser AuthPrincipal user, @PathVariable UUID id) {
        return ticketService.complete(user, id);
    }

    @PatchMapping("/tickets/{id}/no-show")
    public StaffTicketView noShow(@CurrentUser AuthPrincipal user, @PathVariable UUID id) {
        return ticketService.noShow(user, id);
    }

    @PatchMapping("/tickets/{id}/requeue")
    public StaffTicketView requeue(@CurrentUser AuthPrincipal user, @PathVariable UUID id) {
        return ticketService.requeue(user, id);
    }

    @PatchMapping("/tickets/{id}/payment")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void payment(@CurrentUser AuthPrincipal user, @PathVariable UUID id,
                        @Valid @RequestBody PaymentOverrideRequest req) {
        paymentService.staffOverride(user.requireTenant(), user.userId(), id, req.action(), req.reason());
    }

    /** Walk-in ticket in under 5 seconds (phone optional for customers without a phone). */
    @PostMapping("/walk-in")
    @ResponseStatus(HttpStatus.CREATED)
    public StaffTicketView walkIn(@CurrentUser AuthPrincipal user, @Valid @RequestBody WalkInRequest req) {
        return ticketService.walkIn(user, req);
    }

    @PatchMapping("/me/counter")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setCounter(@CurrentUser AuthPrincipal user, @Valid @RequestBody CounterRequest req) {
        var u = users.findByIdAndTenantId(user.userId(), user.requireTenant())
                .orElseThrow(() -> ApiException.notFound("User"));
        u.setCounterLabel(req.counterLabel().trim());
        users.save(u);
    }
}
