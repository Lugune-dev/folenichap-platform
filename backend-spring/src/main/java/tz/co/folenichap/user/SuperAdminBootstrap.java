package tz.co.folenichap.user;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
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
        if (b.superAdminPassword() == null || b.superAdminPassword().length() < 10) {
            log.warn("SUPER_ADMIN_PASSWORD missing or shorter than 10 characters; super admin not created");
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
}
