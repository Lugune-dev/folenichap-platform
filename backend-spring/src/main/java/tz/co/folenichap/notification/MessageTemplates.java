package tz.co.folenichap.notification;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/**
 * Bilingual (Swahili / English) message bodies. The WhatsApp template parameters are passed
 * in exactly the order listed by {@link Message#params()}; create matching utility templates
 * in Meta Business Manager (see README).
 */
public final class MessageTemplates {

    private MessageTemplates() {}

    public record Message(String templateKey, String text, List<String> params) {}

    public static Message booked(String lang, String name, String number, String business, long ahead, int eta, String url) {
        String text = "en".equals(lang)
                ? "Hello %s, your queue number at %s is %s. People ahead of you: %d (about %d min). Track live: %s"
                        .formatted(name, business, number, ahead, eta, url)
                : "Habari %s, namba yako ya foleni %s ni %s. Watu %d wako mbele yako (takriban dakika %d). Fuatilia hapa: %s"
                        .formatted(name, business, number, ahead, eta, url);
        return new Message("BOOKED", text, List.of(name, number, business, String.valueOf(ahead), String.valueOf(eta), url));
    }

    public static Message nearTurn(String lang, String name, String number, String business, long ahead) {
        String text = "en".equals(lang)
                ? "Hello %s, your turn (%s) at %s is coming up - only %d ahead of you. Please come to the reception now."
                        .formatted(name, number, business, ahead)
                : "Habari %s, zamu yako (%s) %s inakaribia - wamebaki watu %d tu mbele yako. Tafadhali fika mapokezi sasa."
                        .formatted(name, number, business, ahead);
        return new Message("NEAR_TURN", text, List.of(name, number, business, String.valueOf(ahead)));
    }

    public static Message called(String lang, String name, String number, String counter, String business) {
        String text = "en".equals(lang)
                ? "%s, ticket %s: please proceed to %s now. - %s".formatted(name, number, counter, business)
                : "%s, namba %s: tafadhali nenda %s sasa. - %s".formatted(name, number, counter, business);
        return new Message("CALLED", text, List.of(name, number, counter, business));
    }

    private static final DateTimeFormatter WHEN_EN = DateTimeFormatter.ofPattern("EEE d MMM 'at' HH:mm", Locale.ENGLISH);
    private static final DateTimeFormatter WHEN_SW = DateTimeFormatter.ofPattern("dd/MM/yyyy 'saa' HH:mm");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

    public static Message appointmentBooked(String lang, String name, String business, String service,
                                            ZonedDateTime start, String url) {
        String when = start.format("en".equals(lang) ? WHEN_EN : WHEN_SW);
        String text = "en".equals(lang)
                ? "Hello %s, your %s appointment at %s is booked for %s. When you arrive, check in here: %s"
                        .formatted(name, service, business, when, url)
                : "Habari %s, miadi yako ya %s %s imethibitishwa: %s. Ukifika, jisajili hapa: %s"
                        .formatted(name, service, business, when, url);
        return new Message("APPOINTMENT_BOOKED", text, List.of(name, service, business, when, url));
    }

    public static Message appointmentReminder(String lang, String name, String business, String service,
                                              ZonedDateTime start, String url) {
        String at = start.format(TIME);
        String text = "en".equals(lang)
                ? "Reminder: %s, your %s appointment at %s is today at %s. Check in when you arrive: %s"
                        .formatted(name, service, business, at, url)
                : "Kumbusho: %s, miadi yako ya %s %s ni leo saa %s. Jisajili ukifika: %s"
                        .formatted(name, service, business, at, url);
        return new Message("APPOINTMENT_REMINDER", text, List.of(name, service, business, at, url));
    }

    public static Message passwordReset(String lang, String code, int validMinutes) {
        String text = "en".equals(lang)
                ? "Your FoleniChap password reset code is %s. It expires in %d minutes. Never share this code."
                        .formatted(code, validMinutes)
                : "Namba yako ya kubadilisha nenosiri la FoleniChap ni %s. Inaisha baada ya dakika %d. Usimpe mtu yeyote."
                        .formatted(code, validMinutes);
        return new Message("PASSWORD_RESET", text, List.of(code));
    }
}
