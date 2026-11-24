package tz.co.folenichap.appointment;

import java.util.UUID;

/** Published inside a transaction; handled after commit (confirmation message). */
public record AppointmentChangedEvent(UUID tenantId, UUID appointmentId, Type type) {

    public enum Type { BOOKED, CANCELLED, CHECKED_IN, NO_SHOW }
}
