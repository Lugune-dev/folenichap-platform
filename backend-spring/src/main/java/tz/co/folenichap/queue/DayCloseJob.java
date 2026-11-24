package tz.co.folenichap.queue;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;

/** Shortly after midnight (EAT), close yesterday's unfinished tickets so reports stay accurate. */
@Slf4j
@Component
@RequiredArgsConstructor
public class DayCloseJob {

    private final QueueTicketRepository tickets;

    @Scheduled(cron = "0 15 0 * * *", zone = "Africa/Dar_es_Salaam")
    @Transactional
    public void closeYesterday() {
        LocalDate today = LocalDate.now(ZoneId.of("Africa/Dar_es_Salaam"));
        int served = tickets.completeStaleServing(today);
        int noShow = tickets.closeStaleTickets(today);
        log.info("Day close: {} serving tickets completed, {} waiting/called tickets marked NO_SHOW", served, noShow);
    }
}
