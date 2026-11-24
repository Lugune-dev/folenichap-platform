package tz.co.folenichap.queue.live;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import tz.co.folenichap.notification.NotificationService;
import tz.co.folenichap.queue.QueueChangedEvent;

/**
 * Runs only after the ticket transaction commits (never broadcasts rolled-back state),
 * asynchronously so that agents' clicks return immediately.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class QueueEventListener {

    private final BoardService boardService;
    private final BoardPublisher publisher;
    private final NotificationService notifications;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onQueueChanged(QueueChangedEvent event) {
        try {
            publisher.publish(event.tenantId(), event.branchId(),
                    boardService.snapshot(event.tenantId(), event.branchId(), event.type().name()));
        } catch (Exception e) {
            log.warn("Board broadcast failed for tenant {}: {}", event.tenantId(), e.getMessage());
        }
        try {
            switch (event.type()) {
                case CREATED -> notifications.ticketBooked(event.ticketId());
                case CALLED, RECALLED -> {
                    notifications.ticketCalled(event.ticketId());
                    notifications.notifyNearTurn(event.tenantId(), event.branchId());
                }
                case COMPLETED, NO_SHOW, CANCELLED -> notifications.notifyNearTurn(event.tenantId(), event.branchId());
                default -> { }
            }
        } catch (Exception e) {
            log.warn("Notification dispatch failed for ticket {}: {}", event.ticketId(), e.getMessage());
        }
    }
}
