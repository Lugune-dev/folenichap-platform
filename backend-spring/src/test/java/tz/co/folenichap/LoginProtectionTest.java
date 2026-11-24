package tz.co.folenichap;

import org.junit.jupiter.api.Test;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.security.LoginProtection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LoginProtectionTest {

    @Test
    void locksEmailAfterFiveFailuresRegardlessOfCase() {
        LoginProtection p = new LoginProtection();
        for (int i = 0; i < 4; i++) {
            p.checkLoginAllowed("10.0.0." + i, "Owner@Example.test");
            assertThat(p.recordFailure("owner@example.test")).isFalse();
        }
        p.checkLoginAllowed("10.0.0.9", "owner@example.test");
        assertThat(p.recordFailure("OWNER@example.test")).isTrue(); // 5th failure triggers the lock

        assertThatThrownBy(() -> p.checkLoginAllowed("10.0.0.99", "owner@example.test"))
                .isInstanceOf(ApiException.class).hasMessageContaining("Too many failed");
    }

    @Test
    void successClearsFailures() {
        LoginProtection p = new LoginProtection();
        for (int i = 0; i < 4; i++) p.recordFailure("a@example.test");
        p.recordSuccess("a@example.test");
        p.recordFailure("a@example.test");
        p.checkLoginAllowed("10.0.0.1", "a@example.test"); // not locked
    }

    @Test
    void limitsLoginAttemptsPerIp() {
        LoginProtection p = new LoginProtection();
        for (int i = 0; i < 20; i++) p.checkLoginAllowed("10.1.1.1", "user" + i + "@example.test");
        assertThatThrownBy(() -> p.checkLoginAllowed("10.1.1.1", "another@example.test"))
                .isInstanceOf(ApiException.class).hasMessageContaining("Too many requests");
    }
}
