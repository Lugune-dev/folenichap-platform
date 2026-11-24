package tz.co.folenichap.payment;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;
import tz.co.folenichap.config.AppProperties;

import java.time.Instant;
import java.util.UUID;

/**
 * Development gateway: accepts every push and "confirms" it after a few seconds,
 * exercising the exact same settlement path as a real webhook. Amounts ending in 13 fail
 * (e.g. TZS 1,013) so you can test the failure UI.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "foleni.payment.gateway", havingValue = "MOCK", matchIfMissing = true)
public class MockPaymentGateway implements PaymentGateway {

    private final TaskScheduler scheduler;
    private final ObjectProvider<PaymentService> paymentService;
    private final int delaySeconds;

    public MockPaymentGateway(TaskScheduler scheduler, ObjectProvider<PaymentService> paymentService, AppProperties props) {
        this.scheduler = scheduler;
        this.paymentService = paymentService;
        this.delaySeconds = props.payment().mockSuccessDelaySeconds();
    }

    @Override
    public String name() {
        return "MOCK";
    }

    @Override
    public StkPushResult initiate(StkPushRequest r) {
        String txn = "MOCK-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        boolean willSucceed = r.amount().remainder(java.math.BigDecimal.valueOf(100)).intValue() != 13;
        log.info("[mock-gateway] STK push {} {} {} to {} -> {} in {}s", r.reference(), r.amount(), r.currency(),
                r.msisdn(), willSucceed ? "SUCCESS" : "FAILED", delaySeconds);
        scheduler.schedule(() -> paymentService.getObject().settle(r.reference(), willSucceed, txn,
                        willSucceed ? null : "Customer cancelled (mock)", r.amount()),
                Instant.now().plusSeconds(delaySeconds));
        return new StkPushResult(true, txn, "Push sent");
    }
}
