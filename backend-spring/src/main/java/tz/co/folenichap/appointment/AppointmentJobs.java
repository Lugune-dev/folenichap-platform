package tz.co.folenichap.appointment;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import tz.co.folenichap.notification.NotificationService;

import java.time.Duration;
import java.time.Instant;

/** Reminders an hour before each appointment, and no-shows for customers who never arrived. */
@Slf4j
@Component
@RequiredArgsConstructor
public class AppointmentJobs {

    static final Duration REMINDER_BEFORE = Duration.ofMinutes(60);
    /** A booking still unclaimed this long after its slot ended becomes a no-show. */
    static final Duration NO_SHOW_AFTER = Duration.ofMinutes(30);

    private final AppointmentRepository appointments;
    private final NotificationService notifications;
    private final TransactionTemplate tx;

    @Scheduled(fixedDelay = 300_000, initialDelay = 60_000)
    public void sendReminders() {
        Instant now = Instant.now();
        for (Appointment a : appointments.findDueReminders(now, now.plus(REMINDER_BEFORE))) {
            Integer claimed = tx.execute(s -> appointments.claimReminder(a.getId()));
            if (claimed != null && claimed == 1) {
                try {
                    notifications.appointmentReminder(a.getId());
                } catch (Exception e) {
                    log.warn("Appointment reminder failed for {}: {}", a.getId(), e.getMessage());
                }
            }
        }
    }

    @Scheduled(fixedDelay = 600_000, initialDelay = 120_000)
    public void markNoShows() {
        Integer n = tx.execute(s -> appointments.markNoShows(Instant.now().minus(NO_SHOW_AFTER)));
        if (n != null && n > 0) {
            log.info("Appointments: {} marked NO_SHOW", n);
        }
    }
}
