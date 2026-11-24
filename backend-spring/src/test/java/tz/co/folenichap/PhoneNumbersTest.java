package tz.co.folenichap;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.common.PhoneNumbers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PhoneNumbersTest {

    @ParameterizedTest
    @ValueSource(strings = {"0712345678", "712345678", "+255712345678", "255 712 345 678", "00255712345678", "0712-345-678"})
    void normalizesTanzanianFormats(String raw) {
        assertThat(PhoneNumbers.normalize(raw)).isEqualTo("255712345678");
    }

    @Test
    void acceptsKenyanInternational() {
        assertThat(PhoneNumbers.normalize("+254712345678")).isEqualTo("254712345678");
    }

    @ParameterizedTest
    @ValueSource(strings = {"12345", "0812345678", "abc", ""})
    void rejectsInvalid(String raw) {
        assertThatThrownBy(() -> PhoneNumbers.normalize(raw)).isInstanceOf(ApiException.class);
    }

    @Test
    void masksForPublicDisplay() {
        assertThat(PhoneNumbers.mask("255712345678")).isEqualTo("0712 *** 678");
    }
}
