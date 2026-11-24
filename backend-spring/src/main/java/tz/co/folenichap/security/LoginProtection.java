package tz.co.folenichap.security;

import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tz.co.folenichap.common.ApiException;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Brute-force protection for credential endpoints.
 * <ul>
 *   <li>Per-IP sliding windows for login / register / refresh (stops password spraying and sign-up spam).</li>
 *   <li>Per-email lockout: {@value #MAX_FAILURES} failed logins within the window lock that email for
 *       {@link #LOCK_WINDOW}. Tracked by the submitted email string whether or not the account exists,
 *       so the lockout itself reveals nothing about which emails are registered.</li>
 * </ul>
 * In-memory is enough for a single instance; move to Redis when running several backends.
 */
@Component
public class LoginProtection {

    static final int MAX_FAILURES = 5;
    static final Duration LOCK_WINDOW = Duration.ofMinutes(15);

    private static final int LOGIN_PER_IP_PER_MIN = 20;
    private static final int REFRESH_PER_IP_PER_MIN = 60;
    private static final int REGISTER_PER_IP_PER_HOUR = 5;
    private static final int RESET_REQUESTS_PER_IP_PER_HOUR = 10;
    private static final int RESET_ATTEMPTS_PER_IP_PER_15MIN = 20;

    private final Map<String, Deque<Long>> windows = new ConcurrentHashMap<>();
    private final Map<String, Deque<Long>> failures = new ConcurrentHashMap<>();

    public void checkLoginAllowed(String ip, String email) {
        hit("login:" + ip, LOGIN_PER_IP_PER_MIN, Duration.ofMinutes(1));
        Deque<Long> f = failures.get(key(email));
        if (f == null) {
            return;
        }
        long now = System.currentTimeMillis();
        synchronized (f) {
            prune(f, now, LOCK_WINDOW.toMillis());
            if (f.size() >= MAX_FAILURES) {
                long retryMs = LOCK_WINDOW.toMillis() - (now - f.peekLast());
                long minutes = Math.max(1, (retryMs + 59_999) / 60_000);
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "ACCOUNT_LOCKED",
                        "Too many failed sign-in attempts. Try again in " + minutes + " minute(s).");
            }
        }
    }

    /** @return true when this failure just triggered a lock (for auditing). */
    public boolean recordFailure(String email) {
        long now = System.currentTimeMillis();
        Deque<Long> f = failures.computeIfAbsent(key(email), k -> new ArrayDeque<>());
        synchronized (f) {
            prune(f, now, LOCK_WINDOW.toMillis());
            f.addLast(now);
            return f.size() == MAX_FAILURES;
        }
    }

    public void recordSuccess(String email) {
        failures.remove(key(email));
    }

    public void checkRegisterAllowed(String ip) {
        hit("register:" + ip, REGISTER_PER_IP_PER_HOUR, Duration.ofHours(1));
    }

    /** "Forgot password" requests: each one can send an SMS, so the budget is small. */
    public void checkPasswordResetAllowed(String ip) {
        hit("reset-request:" + ip, RESET_REQUESTS_PER_IP_PER_HOUR, Duration.ofHours(1));
    }

    /** Code guesses from one IP across all accounts (per-code attempts are limited separately). */
    public void checkPasswordResetAttemptAllowed(String ip) {
        hit("reset-attempt:" + ip, RESET_ATTEMPTS_PER_IP_PER_15MIN, Duration.ofMinutes(15));
    }

    public void checkRefreshAllowed(String ip) {
        hit("refresh:" + ip, REFRESH_PER_IP_PER_MIN, Duration.ofMinutes(1));
    }

    private void hit(String key, int max, Duration window) {
        long now = System.currentTimeMillis();
        Deque<Long> q = windows.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            prune(q, now, window.toMillis());
            if (q.size() >= max) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
                        "Too many requests. Please wait a moment and try again.");
            }
            q.addLast(now);
        }
    }

    private static void prune(Deque<Long> q, long now, long windowMs) {
        while (!q.isEmpty() && now - q.peekFirst() > windowMs) {
            q.pollFirst();
        }
    }

    private static String key(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    @Scheduled(fixedDelay = 300_000)
    public void evict() {
        long now = System.currentTimeMillis();
        long max = Duration.ofHours(1).toMillis();
        windows.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                return e.getValue().isEmpty() || now - e.getValue().peekLast() > max;
            }
        });
        failures.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                return e.getValue().isEmpty() || now - e.getValue().peekLast() > LOCK_WINDOW.toMillis();
            }
        });
    }
}
