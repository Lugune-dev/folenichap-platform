package tz.co.folenichap.appointment;

public enum AppointmentStatus {
    /** Slot reserved; customer has not arrived yet. */
    BOOKED,
    /** Customer arrived and received a queue ticket. */
    CHECKED_IN,
    CANCELLED,
    NO_SHOW;

    /** Statuses that occupy a slot's capacity. */
    public static final java.util.Set<AppointmentStatus> HOLDING = java.util.EnumSet.of(BOOKED, CHECKED_IN);
}
