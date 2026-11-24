package tz.co.folenichap.payment;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.co.folenichap.security.AuthPrincipal;
import tz.co.folenichap.security.CurrentUser;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/payments")
@RequiredArgsConstructor
public class AdminPaymentController {

    private final PaymentRepository payments;

    public record PaymentView(UUID id, UUID ticketId, String type, String provider, String gateway, String msisdn,
                              String reference, String providerTransactionId, BigDecimal amount, String currency,
                              String status, String failureReason, Instant paidAt, Instant createdAt) {}

    public record PageView<T>(java.util.List<T> items, int page, int size, long total) {}

    @GetMapping
    @Transactional(readOnly = true)
    public PageView<PaymentView> list(@CurrentUser AuthPrincipal user,
                                      @RequestParam(defaultValue = "0") int page,
                                      @RequestParam(defaultValue = "25") int size) {
        Page<Payment> p = payments.findByTenantIdOrderByCreatedAtDesc(user.requireTenant(),
                PageRequest.of(Math.max(0, page), Math.min(100, Math.max(1, size))));
        return new PageView<>(p.getContent().stream().map(x -> new PaymentView(x.getId(), x.getTicketId(),
                x.getPaymentType().name(), x.getProvider().name(), x.getGateway(), x.getMsisdn(),
                x.getExternalReference(), x.getProviderTransactionId(), x.getAmount(), x.getCurrency(),
                x.getStatus().name(), x.getFailureReason(), x.getPaidAt(), x.getCreatedAt())).toList(),
                p.getNumber(), p.getSize(), p.getTotalElements());
    }
}
