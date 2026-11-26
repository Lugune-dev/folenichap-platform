package tz.co.folenichap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

// No auto-created in-memory user: all logins go through JWT (removes the "generated security password" user).
@SpringBootApplication(exclude = org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
@EnableAsync
@EnableScheduling
public class FoleniChapApplication {

    public static void main(String[] args) {
        SpringApplication app = new SpringApplication(FoleniChapApplication.class);
        app.addListeners(new tz.co.folenichap.config.DatabaseSettingsCheck()); // safe DB settings summary in the logs
        app.run(args);
    }
}
