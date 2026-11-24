package tz.co.folenichap.appointment;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Pure slot arithmetic, kept free of Spring and the database so it is easy to test.
 * <p>
 * A day's slots run from the branch opening time in steps of the service duration (at least
 * {@value #MIN_STEP_MINUTES} minutes); a slot must finish by closing time. A slot is free while
 * fewer than {@code capacity} bookings overlap it.
 */
public final class SlotCalculator {

    static final int MIN_STEP_MINUTES = 5;
    /** Used when a branch has not configured any opening hours (the queue then treats it as always open). */
    static final LocalTime DEFAULT_OPEN = LocalTime.of(8, 0);
    static final LocalTime DEFAULT_CLOSE = LocalTime.of(17, 0);

    private SlotCalculator() {}

    public record Interval(Instant start, Instant end) {}

    public record Slot(Instant start, Instant end, int capacity, int booked) {
        public int remaining() {
            return Math.max(0, capacity - booked);
        }

        public boolean available() {
            return remaining() > 0;
        }
    }

    /**
     * @param hours     branch operating hours, e.g. {@code {"mon": {"open": "08:00", "close": "18:00"}}};
     *                  empty = not configured (default hours), missing day = closed that day
     * @param notBefore slots starting before this instant are left out (past slots and booking lead time)
     */
    public static List<Slot> slots(LocalDate date, ZoneId zone, Map<String, Map<String, String>> hours,
                                   int durationMinutes, int capacity, List<Interval> booked, Instant notBefore) {
        LocalTime[] window = window(date, hours);
        if (window == null) {
            return List.of();
        }
        Duration length = Duration.ofMinutes(Math.max(1, durationMinutes));
        Duration step = Duration.ofMinutes(Math.max(MIN_STEP_MINUTES, durationMinutes));
        ZonedDateTime close = date.atTime(window[1]).atZone(zone);
        List<Slot> out = new ArrayList<>();
        for (ZonedDateTime s = date.atTime(window[0]).atZone(zone); !s.plus(length).isAfter(close); s = s.plus(step)) {
            Instant start = s.toInstant();
            Instant end = start.plus(length);
            if (start.isBefore(notBefore)) {
                continue;
            }
            int taken = (int) booked.stream().filter(b -> b.start().isBefore(end) && b.end().isAfter(start)).count();
            out.add(new Slot(start, end, capacity, taken));
        }
        return out;
    }

    /** Opening and closing time for the date, or null when the branch is closed that day. */
    static LocalTime[] window(LocalDate date, Map<String, Map<String, String>> hours) {
        if (hours == null || hours.isEmpty()) {
            return new LocalTime[] {DEFAULT_OPEN, DEFAULT_CLOSE};
        }
        Map<String, String> day = hours.get(dayKey(date.getDayOfWeek()));
        if (day == null || day.get("open") == null || day.get("close") == null) {
            return null;
        }
        LocalTime open = LocalTime.parse(day.get("open"));
        LocalTime close = LocalTime.parse(day.get("close"));
        return close.isAfter(open) ? new LocalTime[] {open, close} : null;
    }

    static String dayKey(DayOfWeek dow) {
        return dow.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).toLowerCase(Locale.ROOT); // mon, tue...
    }
}
