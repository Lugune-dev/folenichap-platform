package tz.co.folenichap.common;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * Business exception carrying an HTTP status and a stable machine-readable code
 * (the frontend maps codes to Swahili/English messages).
 */
@Getter
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static ApiException notFound(String what) {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", what + " not found");
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    public static ApiException forbidden(String code, String message) {
        return new ApiException(HttpStatus.FORBIDDEN, code, message);
    }

    public static ApiException paymentRequired(String code, String message) {
        return new ApiException(HttpStatus.PAYMENT_REQUIRED, code, message);
    }
}
