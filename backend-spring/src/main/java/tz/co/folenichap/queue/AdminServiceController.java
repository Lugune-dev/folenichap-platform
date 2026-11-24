package tz.co.folenichap.queue;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.queue.QueueDtos.ServiceRequest;
import tz.co.folenichap.queue.QueueDtos.ServiceView;
import tz.co.folenichap.security.AuthPrincipal;
import tz.co.folenichap.security.CurrentUser;
import tz.co.folenichap.tenant.TenantGuard;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/services")
@RequiredArgsConstructor
public class AdminServiceController {

    private final ServiceRepository services;
    private final TenantGuard tenantGuard;

    @GetMapping
    @Transactional(readOnly = true)
    public List<ServiceView> list(@CurrentUser AuthPrincipal user) {
        return services.findByTenantIdOrderBySortOrderAscNameAsc(user.requireTenant()).stream().map(ServiceView::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public ServiceView create(@CurrentUser AuthPrincipal user, @Valid @RequestBody ServiceRequest req) {
        UUID tenantId = user.requireTenant();
        String prefix = req.ticketPrefix().toUpperCase(Locale.ROOT);
        if (services.existsByTenantIdAndTicketPrefixAndActiveTrue(tenantId, prefix)) {
            throw ApiException.conflict("PREFIX_TAKEN", "Ticket prefix " + prefix + " is already used by another service");
        }
        ServiceOffering s = new ServiceOffering();
        s.setTenantId(tenantId);
        apply(s, req, tenantId);
        return ServiceView.of(services.save(s));
    }

    @PutMapping("/{id}")
    @Transactional
    public ServiceView update(@CurrentUser AuthPrincipal user, @PathVariable UUID id, @Valid @RequestBody ServiceRequest req) {
        UUID tenantId = user.requireTenant();
        ServiceOffering s = services.findByIdAndTenantId(id, tenantId).orElseThrow(() -> ApiException.notFound("Service"));
        String prefix = req.ticketPrefix().toUpperCase(Locale.ROOT);
        if (!prefix.equals(s.getTicketPrefix()) && services.existsByTenantIdAndTicketPrefixAndActiveTrue(tenantId, prefix)) {
            throw ApiException.conflict("PREFIX_TAKEN", "Ticket prefix " + prefix + " is already used by another service");
        }
        apply(s, req, tenantId);
        return ServiceView.of(s);
    }

    /** Soft delete: tickets keep referencing the service for reporting. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void deactivate(@CurrentUser AuthPrincipal user, @PathVariable UUID id) {
        services.findByIdAndTenantId(id, user.requireTenant()).orElseThrow(() -> ApiException.notFound("Service"))
                .setActive(false);
    }

    private void apply(ServiceOffering s, ServiceRequest req, UUID tenantId) {
        boolean upfront = req.requireUpfrontPayment();
        if (upfront && req.feeAmount().signum() <= 0) {
            throw ApiException.badRequest("FEE_REQUIRED", "Set a fee to require upfront payment");
        }
        if (upfront && !tenantGuard.load(tenantId).effectivePlan().paymentsEnabled()) {
            throw ApiException.forbidden("PLAN_FEATURE", "Upfront mobile money payment requires the Pro plan");
        }
        s.setName(req.name().trim());
        s.setNameSw(req.nameSw());
        s.setDescription(req.description());
        s.setTicketPrefix(req.ticketPrefix().toUpperCase(Locale.ROOT));
        s.setAvgDurationMinutes(req.avgDurationMinutes());
        s.setFeeAmount(req.feeAmount());
        s.setRequireUpfrontPayment(upfront);
        if (req.sortOrder() != null) s.setSortOrder(req.sortOrder());
        if (req.active() != null) s.setActive(req.active());
        if (req.allowAppointments() != null) s.setAllowAppointments(req.allowAppointments());
        if (req.slotCapacity() != null) s.setSlotCapacity(req.slotCapacity());
    }
}
