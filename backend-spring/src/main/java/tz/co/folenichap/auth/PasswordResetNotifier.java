package tz.co.folenichap.auth;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import tz.co.folenichap.auth.PasswordResetService.CodeIssued;
import tz.co.folenichap.notification.MessageTemplates;
import tz.co.folenichap.notification.NotificationService;

/**
 * Sends the reset code after the code row has committed, off the request thread, so the
 * "forgot password" response time is the same whether or not a message was sent.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PasswordResetNotifier {

    private final NotificationService notifications;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCodeIssued(CodeIssued e) {
        try {
            boolean sent = notifications.sendPlatformMessage(e.tenantId(), e.phone(), e.language(),
                    MessageTemplates.passwordReset(e.language(), e.code(), PasswordResetService.CODE_MINUTES));
            if (!sent) {
                log.warn("Password reset code could not be delivered (no WhatsApp/SMS channel accepted it)");
            }
        } catch (Exception ex) {
            log.warn("Password reset delivery failed: {}", ex.getMessage());
        }
    }
}
