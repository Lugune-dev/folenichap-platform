package tz.co.folenichap.queue.live;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tz.co.folenichap.queue.QueueDtos.BoardSnapshot;

import java.util.UUID;

@Component
@ConditionalOnProperty(name = "foleni.sse.redis-relay", havingValue = "false", matchIfMissing = true)
@RequiredArgsConstructor
public class LocalBoardPublisher implements BoardPublisher {

    private final SseBroadcaster broadcaster;

    @Override
    public void publish(UUID tenantId, UUID branchId, BoardSnapshot snapshot) {
        broadcaster.broadcastLocal(tenantId, branchId, "board", snapshot);
    }
}
