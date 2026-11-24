package tz.co.folenichap.queue;

import java.util.UUID;

/** Published inside a transaction; consumed after commit (SSE broadcast + notifications). */
public record QueueChangedEvent(UUID tenantId, UUID branchId, UUID ticketId, Type type) {

    public enum Type {
        CREATED, CALLED, RECALLED, STARTED, COMPLETED, NO_SHOW, CANCELLED, REQUEUED, PAYMENT_UPDATED
    }
}
