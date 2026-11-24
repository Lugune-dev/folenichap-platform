package tz.co.folenichap.queue;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.UUID;

/** Gap-free, race-free daily ticket numbering using a single atomic UPSERT. */
@Repository
@RequiredArgsConstructor
public class TicketSequenceDao {

    private final JdbcTemplate jdbc;

    public int next(UUID branchId, UUID serviceId, LocalDate date) {
        Integer n = jdbc.queryForObject("""
                INSERT INTO ticket_sequences (branch_id, service_id, queue_date, last_number)
                VALUES (?, ?, ?, 1)
                ON CONFLICT (branch_id, service_id, queue_date)
                DO UPDATE SET last_number = ticket_sequences.last_number + 1
                RETURNING last_number
                """, Integer.class, branchId, serviceId, date);
        if (n == null) {
            throw new IllegalStateException("ticket sequence returned null");
        }
        return n;
    }
}
