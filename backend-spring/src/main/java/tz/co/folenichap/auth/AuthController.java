package tz.co.folenichap.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.co.folenichap.auth.AuthDtos.ForgotPasswordRequest;
import tz.co.folenichap.auth.AuthDtos.LoginRequest;
import tz.co.folenichap.auth.AuthDtos.ResetPasswordRequest;
import tz.co.folenichap.auth.AuthDtos.RegisterRequest;
import tz.co.folenichap.auth.AuthDtos.TokenResponse;
import tz.co.folenichap.auth.AuthDtos.UserView;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.config.AppProperties;
import tz.co.folenichap.security.AuthPrincipal;
import tz.co.folenichap.security.CurrentUser;
import tz.co.folenichap.security.LoginProtection;

import java.time.Duration;

/**
 * Authentication endpoints.
 * <p>
 * The refresh token never reaches JavaScript: it travels only in an {@code HttpOnly; Secure;
 * SameSite=Strict} cookie scoped to {@value #COOKIE_PATH}. The short-lived access token is returned
 * in the body and kept in memory by the client, so an XSS bug cannot steal a long-lived session.
 */
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    static final String COOKIE = "fc_rt";
    static final String COOKIE_PATH = "/api/v1/auth";

    private final AuthService authService;
    private final PasswordResetService passwordReset;
    private final LoginProtection loginProtection;
    private final AppProperties props;

    /** Creates a new tenant + admin user with a 14-day free trial. */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public TokenResponse register(@Valid @RequestBody RegisterRequest req, HttpServletRequest request,
                                  HttpServletResponse response) {
        loginProtection.checkRegisterAllowed(request.getRemoteAddr());
        return withCookie(authService.register(req), response);
    }

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody LoginRequest req, HttpServletRequest request,
                               HttpServletResponse response) {
        return withCookie(authService.login(req, request.getRemoteAddr()), response);
    }

    @PostMapping("/refresh")
    public TokenResponse refresh(@CookieValue(name = COOKIE, required = false) String refreshToken,
                                 HttpServletRequest request, HttpServletResponse response) {
        loginProtection.checkRefreshAllowed(request.getRemoteAddr());
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH", "Session expired");
        }
        try {
            return withCookie(authService.refresh(refreshToken), response);
        } catch (ApiException e) {
            clearCookie(response);
            throw e;
        }
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@CookieValue(name = COOKIE, required = false) String refreshToken, HttpServletResponse response) {
        if (refreshToken != null && !refreshToken.isBlank()) {
            authService.logout(refreshToken);
        }
        clearCookie(response);
    }

    /** Sends a 6-digit code to the account's phone. Always 202, so it never reveals which emails exist. */
    @PostMapping("/password/forgot")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void forgotPassword(@Valid @RequestBody ForgotPasswordRequest req, HttpServletRequest request) {
        passwordReset.requestCode(req.email(), request.getRemoteAddr());
    }

    /** Sets a new password with the code; signs the user out of every device. */
    @PostMapping("/password/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@Valid @RequestBody ResetPasswordRequest req, HttpServletRequest request,
                              HttpServletResponse response) {
        passwordReset.reset(req.email(), req.code(), req.newPassword(), request.getRemoteAddr());
        clearCookie(response);
    }

    @GetMapping("/me")
    public UserView me(@CurrentUser AuthPrincipal principal) {
        if (principal == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Login required");
        }
        return authService.me(principal.userId());
    }

    /** Moves the refresh token from the body into the HttpOnly cookie. */
    private TokenResponse withCookie(TokenResponse res, HttpServletResponse response) {
        if (res.refreshToken() != null) {
            response.addHeader(HttpHeaders.SET_COOKIE, cookie(res.refreshToken(),
                    Duration.ofDays(props.security().refreshTokenDays())).toString());
        }
        return new TokenResponse(res.accessToken(), null, res.expiresIn(), res.user());
    }

    private void clearCookie(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString());
    }

    private ResponseCookie cookie(String value, Duration maxAge) {
        return ResponseCookie.from(COOKIE, value)
                .httpOnly(true)
                .secure(props.security().refreshCookieSecure())
                .sameSite("Strict")
                .path(COOKIE_PATH)
                .maxAge(maxAge)
                .build();
    }
}
