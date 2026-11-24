package tz.co.folenichap;

import org.junit.jupiter.api.Test;
import tz.co.folenichap.security.StrongPassword;

import static org.assertj.core.api.Assertions.assertThat;

class StrongPasswordTest {

    private final StrongPassword.Validator v = new StrongPassword.Validator();

    @Test
    void acceptsStrongPasswords() {
        assertThat(v.isValid("Karibu#Dar2026", null)).isTrue();
        assertThat(v.isValid("SalamaSana99", null)).isTrue();
    }

    @Test
    void rejectsWeakPasswords() {
        assertThat(v.isValid("Short1A", null)).isFalse();          // too short
        assertThat(v.isValid("alllowercase123", null)).isFalse();  // no upper-case
        assertThat(v.isValid("ALLUPPERCASE123", null)).isFalse();  // no lower-case
        assertThat(v.isValid("NoDigitsHereAtAll", null)).isFalse(); // no digit
        assertThat(v.isValid("Password123", null)).isFalse();      // common password
    }
}
