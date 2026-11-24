package tz.co.folenichap;

import org.junit.jupiter.api.Test;
import tz.co.folenichap.notification.MessageTemplates;
import tz.co.folenichap.notification.MessageTemplates.Message;

import java.time.ZoneId;
import java.time.ZonedDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class MessageTemplatesTest {

    private static final ZonedDateTime START = ZonedDateTime.of(2026, 11, 20, 14, 30, 0, 0, ZoneId.of("Africa/Dar_es_Salaam"));

    @Test
    void appointmentConfirmationIsBilingual() {
        Message en = MessageTemplates.appointmentBooked("en", "Asha", "Smile Clinic", "Cleaning", START, "https://x/a/t");
        assertThat(en.text()).contains("Fri 20 Nov at 14:30").contains("https://x/a/t");
        Message sw = MessageTemplates.appointmentBooked("sw", "Asha", "Smile Clinic", "Kusafisha", START, "https://x/a/t");
        assertThat(sw.text()).startsWith("Habari Asha").contains("20/11/2026 saa 14:30");
        assertThat(sw.params()).hasSize(5);
    }

    @Test
    void resetCodeMessageContainsCodeAndExpiry() {
        Message m = MessageTemplates.passwordReset("en", "042317", 15);
        assertThat(m.text()).contains("042317").contains("15 minutes");
        assertThat(m.params()).containsExactly("042317");
    }
}
