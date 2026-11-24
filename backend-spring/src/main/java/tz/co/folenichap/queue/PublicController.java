package tz.co.folenichap.queue;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tz.co.folenichap.queue.QueueDtos.BoardSnapshot;
import tz.co.folenichap.queue.QueueDtos.CreateTicketRequest;
import tz.co.folenichap.queue.QueueDtos.PayTicketRequest;
import tz.co.folenichap.queue.QueueDtos.PublicTenantView;
import tz.co.folenichap.queue.QueueDtos.TicketStatusView;
import tz.co.folenichap.queue.live.BoardService;
import tz.co.folenichap.queue.live.SseBroadcaster;
import tz.co.folenichap.tenant.Branch;
import tz.co.folenichap.tenant.Tenant;
import tz.co.folenichap.tenant.TenantGuard;

import java.util.UUID;

/** Anonymous endpoints used by the QR booking page, ticket tracker and TV board. */
@RestController
@RequestMapping("/api/v1/public")
@RequiredArgsConstructor
public class PublicController {

    private final PublicBookingService booking;
    private final TicketService ticketService;
    private final PublicRateLimiter rateLimiter;
    private final TenantGuard tenantGuard;
    private final BoardService boardService;
    private final SseBroadcaster broadcaster;

    /** Business profile, active services and current waiting count. */
    @GetMapping("/tenants/{slug}")
    public PublicTenantView tenant(@PathVariable String slug, @RequestParam(required = false) UUID branchId) {
        return booking.profile(slug, branchId);
    }

    /** Issues a digital ticket; triggers mobile money STK push if the service has a fee. */
    @PostMapping("/tenants/{slug}/tickets")
    @ResponseStatus(HttpStatus.CREATED)
    public TicketStatusView createTicket(@PathVariable String slug, @Valid @RequestBody CreateTicketRequest req,
                                         HttpServletRequest http) {
        // mobile carriers use carrier-grade NAT, so the IP budget is generous and the phone budget strict
        rateLimiter.check("ip:" + http.getRemoteAddr());
        rateLimiter.check("phone:" + req.customerPhone().replaceAll("[^0-9]", ""), 3);
        return booking.book(slug, req);
    }

    @GetMapping("/tenants/{slug}/board")
    public BoardSnapshot board(@PathVariable String slug, @RequestParam(required = false) UUID branchId) {
        Tenant t = tenantGuard.loadBySlug(slug);
        Branch b = tenantGuard.resolveBranch(t.getId(), branchId, null);
        return boardService.snapshot(t.getId(), b.getId(), "SNAPSHOT");
    }

    /** Real-time Server-Sent Events stream for the TV board, mobile tracker and staff desk. */
    @GetMapping(path = "/tenants/{slug}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable String slug, @RequestParam(required = false) UUID branchId,
                             HttpServletResponse response) {
        Tenant t = tenantGuard.loadBySlug(slug);
        Branch b = tenantGuard.resolveBranch(t.getId(), branchId, null);
        response.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering for this response
        response.setHeader("Cache-Control", "no-cache");
        return broadcaster.subscribe(t.getId(), b.getId(), boardService.snapshot(t.getId(), b.getId(), "SNAPSHOT"));
    }

    @GetMapping("/tickets/{token}")
    public TicketStatusView ticket(@PathVariable String token) {
        return booking.status(token, null);
    }

    @PostMapping("/tickets/{token}/pay")
    public TicketStatusView pay(@PathVariable String token, @Valid @RequestBody PayTicketRequest req,
                                HttpServletRequest http) {
        rateLimiter.check("pay:" + http.getRemoteAddr());
        // each attempt sends a USSD prompt to a real phone: cap per ticket and per target number
        rateLimiter.check("pay-ticket:" + token, 3);
        if (req.payerPhone() != null) {
            rateLimiter.check("pay-phone:" + req.payerPhone().replaceAll("[^0-9]", ""), 3);
        }
        return booking.pay(token, req.paymentProvider(), req.payerPhone());
    }

    @PostMapping("/tickets/{token}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable String token) {
        ticketService.cancelByCustomer(token);
    }
}
