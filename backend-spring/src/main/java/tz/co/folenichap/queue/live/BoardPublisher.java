package tz.co.folenichap.queue.live;

import tz.co.folenichap.queue.QueueDtos.BoardSnapshot;

import java.util.UUID;

/** Fan-out of board updates: local only, or via Redis pub/sub for multi-instance deployments. */
public interface BoardPublisher {
    void publish(UUID tenantId, UUID branchId, BoardSnapshot snapshot);
}
