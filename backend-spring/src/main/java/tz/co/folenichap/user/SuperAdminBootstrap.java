package tz.co.folenichap.user;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tz.co.folenichap.config.AppProperties;

/** Creates the platform owner account on first start (credentials from env vars). */
@Slf4j
@Component
@RequiredArgsConstructor
public class SuperAdminBootstrap implements ApplicationRunner {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AppProperties props;
    private final Environment env;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        var b = props.bootstrap();
        if (b == null || b.superAdminEmail() == null || b.superAdminEmail().isBlank()) {
            return;
        }
        if (users.existsByRole(Role.SUPER_ADMIN) || users.existsByEmailIgnoreCase(b.superAdminEmail())) {
            return;
        }
        // The most powerful account gets the same password policy as everyone else, and never a documented example.
        String pw = b.superAdminPassword();
        if (!tz.co.folenichap.security.StrongPassword.Validator.isStrong(pw)
                || "ChangeThisStrongPassword!".equals(pw) || "ChangeMe#2026".equals(pw) && !isLocal()) {
            log.warn("SUPER_ADMIN_PASSWORD is missing, an example value, or not strong (10+ characters with upper-case, "
                    + "lower-case and a number); super admin not created");
            return;
        }
        AppUser admin = new AppUser();
        admin.setEmail(b.superAdminEmail().trim().toLowerCase());
        admin.setFullName(b.superAdminName());
        admin.setRole(Role.SUPER_ADMIN);
        admin.setPasswordHash(encoder.encode(b.superAdminPassword()));
        admin.setPreferredLanguage("en");
        users.save(admin);
        log.info("Created SUPER_ADMIN account {}", admin.getEmail());
    }

    /** The local profile's built-in default password is only acceptable on a developer machine. */
    private boolean isLocal() {
        return java.util.Arrays.asList(env.getActiveProfiles()).contains("local");
    }
}
