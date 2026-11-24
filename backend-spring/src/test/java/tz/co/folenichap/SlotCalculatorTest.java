package tz.co.folenichap;

import org.junit.jupiter.api.Test;
import tz.co.folenichap.appointment.SlotCalculator;
import tz.co.folenichap.appointment.SlotCalculator.Interval;
import tz.co.folenichap.appointment.SlotCalculator.Slot;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SlotCalculatorTest {

    private static final ZoneId EAT = ZoneId.of("Africa/Dar_es_Salaam");
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final Map<String, Map<String, String>> HOURS = Map.of(
            "mon", Map.of("open", "08:00", "close", "10:00"));

    private static Instant at(int hour, int minute) {
        return ZonedDateTime.of(MONDAY.atTime(hour, minute), EAT).toInstant();
    }

    @Test
    void slotsStepByDurationAndEndByClosingTime() {
        List<Slot> slots = SlotCalculator.slots(MONDAY, EAT, HOURS, 45, 1, List.of(), Instant.EPOCH);
        // 08:00-08:45, 08:45-09:30; 09:30-10:15 would end after closing
        assertThat(slots).extracting(Slot::start).containsExactly(at(8, 0), at(8, 45));
        assertThat(slots.get(0).end()).isEqualTo(at(8, 45));
    }

    @Test
    void closedDayHasNoSlots() {
        LocalDate tuesday = MONDAY.plusDays(1);
        assertThat(SlotCalculator.slots(tuesday, EAT, HOURS, 30, 1, List.of(), Instant.EPOCH)).isEmpty();
    }

    @Test
    void unconfiguredHoursUseDefaultDay() {
        List<Slot> slots = SlotCalculator.slots(MONDAY, EAT, Map.of(), 60, 1, List.of(), Instant.EPOCH);
        assertThat(slots).hasSize(9); // 08:00 .. 16:00 starts, last one ends at 17:00
        assertThat(slots.get(0).start()).isEqualTo(at(8, 0));
    }

    @Test
    void pastSlotsAreLeftOut() {
        List<Slot> slots = SlotCalculator.slots(MONDAY, EAT, HOURS, 30, 1, List.of(), at(8, 31));
        assertThat(slots).extracting(Slot::start).containsExactly(at(9, 0), at(9, 30));
    }

    @Test
    void capacityCountsOverlappingBookings() {
        List<Interval> booked = List.of(
                new Interval(at(8, 0), at(8, 30)),
                new Interval(at(8, 0), at(8, 30)),
                // booked when the service took 60 minutes: overlaps both 08:30 and 09:00
                new Interval(at(8, 30), at(9, 30)));
        List<Slot> slots = SlotCalculator.slots(MONDAY, EAT, HOURS, 30, 2, booked, Instant.EPOCH);
        assertThat(slots.get(0).available()).isFalse();   // 08:00 full (2 of 2)
        assertThat(slots.get(1).remaining()).isEqualTo(1); // 08:30
        assertThat(slots.get(2).remaining()).isEqualTo(1); // 09:00
        assertThat(slots.get(3).remaining()).isEqualTo(2); // 09:30
    }

    @Test
    void veryShortServicesUseFiveMinuteSteps() {
        List<Slot> slots = SlotCalculator.slots(MONDAY, EAT, HOURS, 2, 1, List.of(), Instant.EPOCH);
        assertThat(slots.get(1).start()).isEqualTo(at(8, 5));
        assertThat(slots.get(0).end()).isEqualTo(at(8, 2));
    }
}
