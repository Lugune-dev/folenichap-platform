package tz.co.folenichap.common;

import java.util.regex.Pattern;

/**
 * Normalises East African mobile numbers to E.164 without '+', e.g. {@code 255712345678}.
 * Accepts: 0712345678, 712345678, +255712345678, 255 712 345 678, and KE/UG/RW/BI numbers in
 * international form.
 */
public final class PhoneNumbers {

    private static final Pattern INTERNATIONAL_EA = Pattern.compile("^(255|254|256|250|257)[17]\\d{8}$");
    private static final Pattern TZ_LOCAL = Pattern.compile("^0?[67]\\d{8}$");

    private PhoneNumbers() {}

    public static String normalize(String raw) {
        if (raw == null) {
            throw ApiException.badRequest("INVALID_PHONE", "Phone number is required");
        }
        String digits = raw.replaceAll("[^0-9]", "");
        if (digits.startsWith("00")) {
            digits = digits.substring(2);
        }
        if (TZ_LOCAL.matcher(digits).matches()) {
            digits = "255" + (digits.startsWith("0") ? digits.substring(1) : digits);
        }
        if (digits.startsWith("255") && digits.length() == 12 && (digits.charAt(3) == '6' || digits.charAt(3) == '7')) {
            return digits;
        }
        if (INTERNATIONAL_EA.matcher(digits).matches()) {
            return digits;
        }
        throw ApiException.badRequest("INVALID_PHONE", "Enter a valid mobile number, e.g. 0712 345 678");
    }

    /** 255712345678 -> 0712 *** 678 for public display. */
    public static String mask(String normalized) {
        if (normalized == null || normalized.length() < 9) {
            return "***";
        }
        String local = "0" + normalized.substring(3);
        return local.substring(0, 4) + " *** " + local.substring(local.length() - 3);
    }
}
