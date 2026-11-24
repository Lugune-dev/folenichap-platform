package tz.co.folenichap.payment;

import tz.co.folenichap.queue.PublicRateLimiter;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.co.folenichap.config.AppProperties;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/webhooks")
@RequiredArgsConstructor
public class WebhookController {

    private final PaymentService paymentService;
    private final AppProperties props;
    private final PublicRateLimiter rateLimiter;

    /**
     * Gateway callback. The raw body is read as a String so the HMAC is computed over the exact
     * bytes the gateway signed.
     */
    @PostMapping({"/payments", "/payments/{gateway}"})
    public ResponseEntity<Map<String, Object>> payment(@PathVariable(required = false) String gateway,
                                                       @RequestParam(required = false) String token,
                                                       @RequestBody String rawBody,
                                                       HttpServletRequest request) {
        // bounds how many (possibly forged) callbacks a single source can make us store
        rateLimiter.check("webhook:" + request.getRemoteAddr(), 120);
        String signature = request.getHeader(props.payment().webhookSignatureHeader());
        paymentService.handleWebhook(gateway == null ? props.payment().gateway() : gateway, rawBody, signature, token,
                request.getRemoteAddr());
        return ResponseEntity.ok(Map.of("received", true));
    }
}
