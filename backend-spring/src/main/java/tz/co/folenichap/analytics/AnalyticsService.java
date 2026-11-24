package tz.co.folenichap.analytics;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.tenant.Tenant;
import tz.co.folenichap.tenant.TenantGuard;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/** Dashboard KPIs computed in SQL (cheap even on the smallest online Postgres tier). */
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final JdbcTemplate jdbc;
    private final TenantGuard tenantGuard;

    public record Summary(LocalDate from, LocalDate to, long totalTickets, long completed, long noShows,
                          long cancelled, long waitingNow, long inServiceNow, BigDecimal avgWaitMinutes,
                          BigDecimal avgServiceMinutes, BigDecimal noShowRate, BigDecimal revenue,
                          long paidTickets) {}

    public record DailyPoint(LocalDate date, long tickets, long completed, long noShows, BigDecimal avgWaitMinutes,
                             BigDecimal revenue) {}

    public record HeatCell(int isoDow, int hour, long tickets) {}

    public record StaffPerformance(UUID userId, String fullName, String counterLabel, long served,
                                   BigDecimal avgServiceMinutes, BigDecimal avgWaitMinutes) {}

    public record ServiceBreakdown(UUID serviceId, String name, String prefix, long tickets, long completed,
                                   BigDecimal avgWaitMinutes, BigDecimal avgServiceMinutes, BigDecimal revenue) {}

    public record Dashboard(Summary summary, List<DailyPoint> daily, List<HeatCell> peakHours,
                            List<StaffPerformance> staff, List<ServiceBreakdown> services) {}

    public Dashboard dashboard(UUID tenantId, LocalDate from, LocalDate to) {
        Tenant t = tenantGuard.load(tenantId);
        LocalDate today = LocalDate.now(t.zone());
        LocalDate f = from == null ? today.minusDays(29) : from;
        LocalDate e = to == null ? today : to;
        if (e.isBefore(f) || ChronoUnit.DAYS.between(f, e) > 366) {
            throw ApiException.badRequest("INVALID_RANGE", "Choose a date range of at most one year");
        }
        String tz = t.getTimezone();
        return new Dashboard(summary(tenantId, f, e, tz), daily(tenantId, f, e, tz), heat(tenantId, f, e, tz),
                staff(tenantId, f, e), services(tenantId, f, e, tz));
    }

    Summary summary(UUID tenantId, LocalDate f, LocalDate e, String tz) {
        return jdbc.queryForObject("""
                WITH t AS (
                    SELECT * FROM queue_tickets WHERE tenant_id = ? AND queue_date BETWEEN ? AND ?
                ), rev AS (
                    SELECT COALESCE(sum(amount), 0) AS revenue, count(DISTINCT ticket_id) AS paid
                    FROM payments
                    WHERE tenant_id = ? AND status = 'SUCCESS' AND payment_type = 'BOOKING_FEE'
                      AND (paid_at AT TIME ZONE ?)::date BETWEEN ? AND ?
                )
                SELECT count(*)                                              AS total,
                       count(*) FILTER (WHERE status = 'COMPLETED')          AS completed,
                       count(*) FILTER (WHERE status = 'NO_SHOW')            AS no_show,
                       count(*) FILTER (WHERE status = 'CANCELLED')          AS cancelled,
                       count(*) FILTER (WHERE status = 'WAITING')            AS waiting,
                       count(*) FILTER (WHERE status IN ('CALLED','SERVING')) AS in_service,
                       round((avg(extract(epoch FROM (called_at - joined_at))) FILTER (WHERE called_at IS NOT NULL) / 60)::numeric, 1) AS avg_wait,
                       round((avg(extract(epoch FROM (completed_at - service_started_at)))
                              FILTER (WHERE status = 'COMPLETED' AND service_started_at IS NOT NULL) / 60)::numeric, 1) AS avg_service,
                       CASE WHEN count(*) FILTER (WHERE status IN ('COMPLETED','NO_SHOW')) = 0 THEN 0
                            ELSE round(100.0 * count(*) FILTER (WHERE status = 'NO_SHOW')
                                       / count(*) FILTER (WHERE status IN ('COMPLETED','NO_SHOW')), 1) END AS no_show_rate,
                       (SELECT revenue FROM rev) AS revenue,
                       (SELECT paid FROM rev)    AS paid
                FROM t
                """, (rs, i) -> new Summary(f, e, rs.getLong("total"), rs.getLong("completed"), rs.getLong("no_show"),
                        rs.getLong("cancelled"), rs.getLong("waiting"), rs.getLong("in_service"),
                        rs.getBigDecimal("avg_wait"), rs.getBigDecimal("avg_service"), rs.getBigDecimal("no_show_rate"),
                        rs.getBigDecimal("revenue"), rs.getLong("paid")),
                tenantId, Date.valueOf(f), Date.valueOf(e), tenantId, tz, Date.valueOf(f), Date.valueOf(e));
    }

    List<DailyPoint> daily(UUID tenantId, LocalDate f, LocalDate e, String tz) {
        return jdbc.query("""
                WITH days AS (
                    SELECT d::date AS day FROM generate_series(?::date, ?::date, interval '1 day') d
                ), t AS (
                    SELECT queue_date,
                           count(*) AS tickets,
                           count(*) FILTER (WHERE status = 'COMPLETED') AS completed,
                           count(*) FILTER (WHERE status = 'NO_SHOW') AS no_show,
                           round((avg(extract(epoch FROM (called_at - joined_at))) FILTER (WHERE called_at IS NOT NULL) / 60)::numeric, 1) AS avg_wait
                    FROM queue_tickets WHERE tenant_id = ? AND queue_date BETWEEN ? AND ?
                    GROUP BY queue_date
                ), r AS (
                    SELECT (paid_at AT TIME ZONE ?)::date AS day, sum(amount) AS revenue
                    FROM payments WHERE tenant_id = ? AND status = 'SUCCESS' AND payment_type = 'BOOKING_FEE'
                      AND (paid_at AT TIME ZONE ?)::date BETWEEN ? AND ?
                    GROUP BY 1
                )
                SELECT days.day, COALESCE(t.tickets, 0) AS tickets, COALESCE(t.completed, 0) AS completed,
                       COALESCE(t.no_show, 0) AS no_show, t.avg_wait, COALESCE(r.revenue, 0) AS revenue
                FROM days LEFT JOIN t ON t.queue_date = days.day LEFT JOIN r ON r.day = days.day
                ORDER BY days.day
                """, (rs, i) -> new DailyPoint(rs.getDate("day").toLocalDate(), rs.getLong("tickets"),
                        rs.getLong("completed"), rs.getLong("no_show"), rs.getBigDecimal("avg_wait"),
                        rs.getBigDecimal("revenue")),
                Date.valueOf(f), Date.valueOf(e), tenantId, Date.valueOf(f), Date.valueOf(e),
                tz, tenantId, tz, Date.valueOf(f), Date.valueOf(e));
    }

    List<HeatCell> heat(UUID tenantId, LocalDate f, LocalDate e, String tz) {
        return jdbc.query("""
                SELECT extract(isodow FROM joined_at AT TIME ZONE ?)::int AS dow,
                       extract(hour FROM joined_at AT TIME ZONE ?)::int   AS hr,
                       count(*) AS tickets
                FROM queue_tickets
                WHERE tenant_id = ? AND queue_date BETWEEN ? AND ?
                GROUP BY 1, 2 ORDER BY 1, 2
                """, (rs, i) -> new HeatCell(rs.getInt("dow"), rs.getInt("hr"), rs.getLong("tickets")),
                tz, tz, tenantId, Date.valueOf(f), Date.valueOf(e));
    }

    List<StaffPerformance> staff(UUID tenantId, LocalDate f, LocalDate e) {
        return jdbc.query("""
                SELECT u.id, u.full_name, u.counter_label,
                       count(t.id) FILTER (WHERE t.status = 'COMPLETED') AS served,
                       round((avg(extract(epoch FROM (t.completed_at - t.service_started_at)))
                              FILTER (WHERE t.status = 'COMPLETED' AND t.service_started_at IS NOT NULL) / 60)::numeric, 1) AS avg_service,
                       round((avg(extract(epoch FROM (t.called_at - t.joined_at))) / 60)::numeric, 1) AS avg_wait
                FROM users u
                JOIN queue_tickets t ON t.served_by_user_id = u.id AND t.queue_date BETWEEN ? AND ?
                WHERE u.tenant_id = ?
                GROUP BY u.id, u.full_name, u.counter_label
                ORDER BY served DESC
                """, (rs, i) -> new StaffPerformance(rs.getObject("id", UUID.class), rs.getString("full_name"),
                        rs.getString("counter_label"), rs.getLong("served"), rs.getBigDecimal("avg_service"),
                        rs.getBigDecimal("avg_wait")),
                Date.valueOf(f), Date.valueOf(e), tenantId);
    }

    List<ServiceBreakdown> services(UUID tenantId, LocalDate f, LocalDate e, String tz) {
        return jdbc.query("""
                SELECT s.id, s.name, s.ticket_prefix,
                       count(t.id) AS tickets,
                       count(t.id) FILTER (WHERE t.status = 'COMPLETED') AS completed,
                       round((avg(extract(epoch FROM (t.called_at - t.joined_at))) FILTER (WHERE t.called_at IS NOT NULL) / 60)::numeric, 1) AS avg_wait,
                       round((avg(extract(epoch FROM (t.completed_at - t.service_started_at)))
                              FILTER (WHERE t.status = 'COMPLETED' AND t.service_started_at IS NOT NULL) / 60)::numeric, 1) AS avg_service,
                       COALESCE((SELECT sum(p.amount) FROM payments p JOIN queue_tickets pt ON pt.id = p.ticket_id
                                 WHERE pt.service_id = s.id AND p.status = 'SUCCESS'
                                   AND (p.paid_at AT TIME ZONE ?)::date BETWEEN ? AND ?), 0) AS revenue
                FROM services s
                LEFT JOIN queue_tickets t ON t.service_id = s.id AND t.queue_date BETWEEN ? AND ?
                WHERE s.tenant_id = ?
                GROUP BY s.id, s.name, s.ticket_prefix
                ORDER BY tickets DESC
                """, (rs, i) -> new ServiceBreakdown(rs.getObject("id", UUID.class), rs.getString("name"),
                        rs.getString("ticket_prefix"), rs.getLong("tickets"), rs.getLong("completed"),
                        rs.getBigDecimal("avg_wait"), rs.getBigDecimal("avg_service"), rs.getBigDecimal("revenue")),
                tz, Date.valueOf(f), Date.valueOf(e), Date.valueOf(f), Date.valueOf(e), tenantId);
    }
}
