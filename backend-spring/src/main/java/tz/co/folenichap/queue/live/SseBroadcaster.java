package tz.co.folenichap.queue.live;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.config.AppProperties;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * In-memory registry of Server-Sent Event subscribers (TV boards, mobile trackers, staff desks),
 * keyed by tenant and branch. With the Redis relay enabled, events published on any instance
 * reach subscribers connected to every instance.
 */
@Slf4j
@Component
public class SseBroadcaster {

    private static final int MAX_SUBSCRIBERS_PER_BRANCH = 1000;

    private record Subscriber(SseEmitter emitter, UUID branchId) {}

    private final Map<UUID, Set<Subscriber>> byTenant = new ConcurrentHashMap<>();
    private final AtomicLong eventIds = new AtomicLong();
    private final long timeoutMillis;

    public SseBroadcaster(AppProperties props) {
        this.timeoutMillis = Duration.ofMinutes(props.sse().timeoutMinutes()).toMillis();
    }

    public SseEmitter subscribe(UUID tenantId, UUID branchId, Object initialSnapshot) {
        Set<Subscriber> subs = byTenant.computeIfAbsent(tenantId, k -> ConcurrentHashMap.newKeySet());
        long sameBranch = subs.stream().filter(s -> s.branchId().equals(branchId)).count();
        if (sameBranch >= MAX_SUBSCRIBERS_PER_BRANCH) {
            throw new ApiException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_STREAMS",
                    "Too many live connections");
        }
        SseEmitter emitter = new SseEmitter(timeoutMillis);
        Subscriber sub = new Subscriber(emitter, branchId);
        subs.add(sub);
        Runnable remove = () -> subs.remove(sub);
        emitter.onCompletion(remove);
        emitter.onTimeout(() -> {
            remove.run();
            emitter.complete();
        });
        emitter.onError(e -> remove.run());
        try {
            emitter.send(SseEmitter.event()
                    .id(String.valueOf(eventIds.incrementAndGet()))
                    .name("board")
                    .reconnectTime(3000)
                    .data(initialSnapshot, MediaType.APPLICATION_JSON));
        } catch (IOException e) {
            remove.run();
            emitter.completeWithError(e);
        }
        return emitter;
    }

    /** Deliver to subscribers connected to THIS instance. */
    public void broadcastLocal(UUID tenantId, UUID branchId, String eventName, Object payload) {
        Set<Subscriber> subs = byTenant.get(tenantId);
        if (subs == null || subs.isEmpty()) {
            return;
        }
        String id = String.valueOf(eventIds.incrementAndGet());
        for (Subscriber sub : subs) {
            if (!sub.branchId().equals(branchId)) {
                continue;
            }
            try {
                sub.emitter().send(SseEmitter.event().id(id).name(eventName).data(payload, MediaType.APPLICATION_JSON));
            } catch (IOException | IllegalStateException e) {
                subs.remove(sub);
            }
        }
    }

    /** Keeps proxies (Nginx, mobile carriers) from closing idle streams. */
    @Scheduled(fixedDelayString = "#{${foleni.sse.heartbeat-seconds:20} * 1000}")
    public void heartbeat() {
        byTenant.values().forEach(subs -> subs.forEach(sub -> {
            try {
                sub.emitter().send(SseEmitter.event().comment("hb"));
            } catch (IOException | IllegalStateException e) {
                subs.remove(sub);
            }
        }));
    }

    public int connectionCount() {
        return byTenant.values().stream().mapToInt(Set::size).sum();
    }
}
