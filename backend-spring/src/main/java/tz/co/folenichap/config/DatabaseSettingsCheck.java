package tz.co.folenichap.config;

import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.net.URI;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Prints a safe summary of the database settings at startup (never the password itself) and fixes the most
 * common copy-paste mistake: spaces or a line break around values pasted into a hosting dashboard.
 * <p>
 * A failed "password authentication" on a hosted platform is otherwise impossible to debug from the logs,
 * because you can't see which host, user or password the app actually received.
 */
public class DatabaseSettingsCheck implements ApplicationListener<ApplicationEnvironmentPreparedEvent> {

    @Override
    public void onApplicationEvent(ApplicationEnvironmentPreparedEvent event) {
        ConfigurableEnvironment env = event.getEnvironment();
        Map<String, Object> fixes = new HashMap<>();

        String url = value(env, "spring.datasource.url", fixes);
        String user = value(env, "spring.datasource.username", fixes);
        String password = value(env, "spring.datasource.password", fixes);
        String flywayUrl = value(env, "spring.flyway.url", fixes);

        if (!fixes.isEmpty()) {
            // Highest precedence, so the trimmed values are what the datasource and Flyway receive.
            env.getPropertySources().addFirst(new MapPropertySource("trimmedDatabaseSettings", fixes));
        }

        log("app database    : " + describe(url));
        log("flyway database : " + describe(flywayUrl));
        log("same database   : " + (flywayUrl == null || sameEndpoint(url, flywayUrl) ? "yes"
                : "NO - DB_URL and DB_MIGRATION_URL point to different Neon endpoints/projects"));
        log("username        : " + (user == null ? "MISSING (set DB_USERNAME)" : unresolved(user) ? "NOT SET - got " + user : user));
        log("password        : " + passwordSummary(password));
        if (!fixes.isEmpty()) {
            log("trimmed spaces/line breaks from: " + String.join(", ", fixes.keySet()));
        }
    }

    private static String value(ConfigurableEnvironment env, String key, Map<String, Object> fixes) {
        String raw;
        try {
            raw = env.getProperty(key);
        } catch (IllegalArgumentException e) { // unresolvable ${...}
            return "${unresolved}";
        }
        if (raw != null && !raw.equals(raw.strip())) {
            fixes.put(key, raw.strip());
            return raw.strip();
        }
        return raw;
    }

    private static boolean unresolved(String v) {
        return v.contains("${");
    }

    private static String passwordSummary(String p) {
        if (p == null || p.isEmpty()) return "MISSING (set DB_PASSWORD)";
        if (unresolved(p)) return "NOT SET - DB_PASSWORD was not found in the environment";
        String kind = p.startsWith("npg_") ? "Neon-style (npg_...)" : "does not start with npg_";
        boolean quoted = (p.startsWith("\"") && p.endsWith("\"")) || (p.startsWith("'") && p.endsWith("'"));
        return "set, " + p.length() + " characters, " + kind + (quoted ? ", WRAPPED IN QUOTES - remove them" : "");
    }

    /** host + database + whether the URL itself carries user/password query parameters (which override DB_*). */
    private static String describe(String jdbcUrl) {
        if (jdbcUrl == null || jdbcUrl.isBlank()) return "MISSING";
        if (unresolved(jdbcUrl)) return "NOT SET - got " + jdbcUrl;
        try {
            URI uri = URI.create(jdbcUrl.replaceFirst("^jdbc:", ""));
            String query = uri.getRawQuery() == null ? "" : uri.getRawQuery().toLowerCase(Locale.ROOT);
            StringBuilder s = new StringBuilder("host=").append(uri.getHost()).append(" db=").append(uri.getPath());
            if (uri.getRawUserInfo() != null) s.append("  WARNING: URL contains user:password@ - remove it");
            if (query.contains("password=")) s.append("  WARNING: URL contains password=... which overrides DB_PASSWORD - remove it");
            if (query.contains("user=")) s.append("  WARNING: URL contains user=... - remove it");
            return s.toString();
        } catch (IllegalArgumentException e) {
            return "unparseable URL (check for spaces or quotes)";
        }
    }

    /** Neon: "ep-x-pooler.region..." and "ep-x.region..." are the same endpoint. */
    private static boolean sameEndpoint(String a, String b) {
        try {
            String ha = URI.create(a.replaceFirst("^jdbc:", "")).getHost();
            String hb = URI.create(b.replaceFirst("^jdbc:", "")).getHost();
            return ha != null && hb != null && ha.replace("-pooler", "").equals(hb.replace("-pooler", ""));
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static void log(String line) {
        System.out.println("[db-check] " + line); // logging isn't fully set up yet at this stage
    }
}
