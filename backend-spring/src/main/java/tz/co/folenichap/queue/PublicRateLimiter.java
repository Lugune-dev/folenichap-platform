package tz.co.folenichap.queue;

import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.config.AppProperties;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sliding-window limiter for anonymous ticket creation (per client IP), protecting tenants from
 * queue flooding. In-memory is sufficient for a single VPS; swap for Redis when scaling out.
 */
@Component
public class PublicRateLimiter {

    private static final long WINDOW_MS = 60_000;

    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();
    private final int limit;

    public PublicRateLimiter(AppProperties props) {
        this.limit = props.rateLimit().publicTicketsPerMinute();
    }

    public void check(String key) {
        check(key, limit);
    }

    public void check(String key, int max) {
        long now = System.currentTimeMillis();
        Deque<Long> q = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst() > WINDOW_MS) {
                q.pollFirst();
            }
            if (q.size() >= max) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
                        "Too many requests. Please wait a minute and try again.");
            }
            q.addLast(now);
        }
    }

    @Scheduled(fixedDelay = 300_000)
    public void evict() {
        long now = System.currentTimeMillis();
        hits.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                return e.getValue().isEmpty() || now - e.getValue().peekLast() > WINDOW_MS;
            }
        });
    }
}
