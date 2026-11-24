package tz.co.folenichap.auth;

import tz.co.folenichap.security.StrongPassword;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank @Size(max = 150) String businessName,
            @Size(max = 100) @Pattern(regexp = "^$|^[a-z0-9]+(-[a-z0-9]+)*$", message = "lowercase letters, digits and dashes only")
            String slug,
            @Size(max = 50) String businessCategory,
            @NotBlank @Size(max = 120) String ownerName,
            @NotBlank @Email @Size(max = 150) String email,
            @NotBlank @Size(max = 20) String phone,
            @NotBlank @StrongPassword String password,
            @Pattern(regexp = "sw|en") String language) {}

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    public record ForgotPasswordRequest(@NotBlank @Email @Size(max = 150) String email) {}

    public record ResetPasswordRequest(@NotBlank @Email @Size(max = 150) String email,
                                       @NotBlank @Pattern(regexp = "^\\d{6}$", message = "6 digits") String code,
                                       @NotBlank @StrongPassword String newPassword) {}

    public record UserView(UUID id, String fullName, String email, String role, UUID tenantId,
                           String tenantSlug, String businessName, UUID branchId, String counterLabel,
                           String language, String plan, String subscriptionStatus) {}

    public record TokenResponse(String accessToken, String refreshToken, long expiresIn, UserView user) {}
}
