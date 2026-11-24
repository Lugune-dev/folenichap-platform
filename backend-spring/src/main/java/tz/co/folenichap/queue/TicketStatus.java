package tz.co.folenichap.queue;

public enum TicketStatus {
    WAITING, CALLED, SERVING, COMPLETED, NO_SHOW, CANCELLED;

    public boolean isActive() {
        return this == WAITING || this == CALLED || this == SERVING;
    }
}
