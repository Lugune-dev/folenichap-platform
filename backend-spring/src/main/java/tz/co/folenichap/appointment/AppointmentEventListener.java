package tz.co.folenichap.appointment;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import tz.co.folenichap.notification.NotificationService;

/** Sends the booking confirmation once the booking has committed. */
@Slf4j
@Component
@RequiredArgsConstructor
public class AppointmentEventListener {

    private final NotificationService notifications;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onAppointmentChanged(AppointmentChangedEvent event) {
        if (event.type() != AppointmentChangedEvent.Type.BOOKED) {
            return;
        }
        try {
            notifications.appointmentBooked(event.appointmentId());
        } catch (Exception e) {
            log.warn("Appointment confirmation failed for {}: {}", event.appointmentId(), e.getMessage());
        }
    }
}
