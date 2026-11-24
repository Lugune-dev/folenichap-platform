package tz.co.folenichap.security;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.Locale;
import java.util.Set;

/**
 * Password policy for any password a person sets: 10-100 characters with an upper-case letter,
 * a lower-case letter and a digit, and not one of the most common passwords.
 */
@Documented
@Constraint(validatedBy = StrongPassword.Validator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
public @interface StrongPassword {

    String message() default "Use at least 10 characters with an upper-case letter, a lower-case letter and a number";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<StrongPassword, String> {

        private static final Set<String> COMMON = Set.of(
                "password123", "password1234", "qwerty12345", "1234567890", "12345678910", "iloveyou123",
                "welcome123", "admin12345", "letmein123", "football123", "password2024", "password2025",
                "password2026", "changeme123", "tanzania123", "karibu12345");

        @Override
        public boolean isValid(String value, ConstraintValidatorContext ctx) {
            if (value == null) {
                return true; // @NotBlank reports missing values
            }
            if (value.length() < 10 || value.length() > 100) {
                return false;
            }
            boolean upper = false, lower = false, digit = false;
            for (int i = 0; i < value.length(); i++) {
                char c = value.charAt(i);
                if (Character.isUpperCase(c)) upper = true;
                else if (Character.isLowerCase(c)) lower = true;
                else if (Character.isDigit(c)) digit = true;
            }
            return upper && lower && digit && !COMMON.contains(value.toLowerCase(Locale.ROOT));
        }
    }
}
