package tz.co.folenichap.tenant;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public final class TenantDtos {

    private TenantDtos() {}

    public record ProfileView(UUID id, String businessName, String slug, String phone, String email,
                              String businessCategory, String logoUrl, String greetingEn, String greetingSw,
                              String defaultLanguage, String timezone, String plan, String effectivePlan,
                              String status, Instant trialEndsAt, Instant currentPeriodEndsAt, int smsCredits,
                              String publicUrl, int maxBranches, int maxStaff) {

        public static ProfileView of(Tenant t, String baseUrl) {
            SubscriptionPlan eff = t.effectivePlan();
            return new ProfileView(t.getId(), t.getBusinessName(), t.getSlug(), t.getPhone(), t.getEmail(),
                    t.getBusinessCategory(), t.getLogoUrl(), t.getGreetingEn(), t.getGreetingSw(),
                    t.getDefaultLanguage(), t.getTimezone(), t.getSubscriptionPlan().name(), eff.name(),
                    t.getSubscriptionStatus().name(), t.getTrialEndsAt(), t.getCurrentPeriodEndsAt(),
                    t.getSmsCredits(), baseUrl + "/b/" + t.getSlug(), eff.maxBranches(),
                    eff.maxStaff() == Integer.MAX_VALUE ? -1 : eff.maxStaff());
        }
    }

    public record ProfileUpdate(@NotBlank @Size(max = 150) String businessName,
                                @NotBlank @Size(max = 20) String phone,
                                @Size(max = 50) String businessCategory,
                                @Size(max = 500) @jakarta.validation.constraints.Pattern(regexp = "^$|^https://[^\\s<>\"]+$", message = "must be an https:// address") String logoUrl,
                                @Size(max = 500) String greetingEn,
                                @Size(max = 500) String greetingSw,
                                @Pattern(regexp = "sw|en") String defaultLanguage) {}

    public record BranchView(UUID id, String name, String address, String phone,
                             Map<String, Map<String, String>> operatingHours, boolean main, boolean active) {
        public static BranchView of(Branch b) {
            return new BranchView(b.getId(), b.getName(), b.getAddress(), b.getPhone(), b.getOperatingHours(),
                    b.isMain(), b.isActive());
        }
    }

    public record BranchRequest(@NotBlank @Size(max = 120) String name,
                                @Size(max = 255) String address,
                                @Size(max = 20) String phone,
                                Map<String, Map<String, String>> operatingHours,
                                Boolean active) {}

    public record SubscriptionPayRequest(@NotNull SubscriptionPlan plan,
                                         @NotBlank @Pattern(regexp = "MPESA|TIGOPESA|AIRTEL|HALOPESA|AZAMPESA") String provider,
                                         @NotBlank String phone) {}

    // ---------- super admin ----------

    public record TenantSummary(UUID id, String businessName, String slug, String email, String phone,
                                String plan, String status, Instant trialEndsAt, Instant currentPeriodEndsAt,
                                int smsCredits, Instant createdAt, long ticketsLast30d, long staffCount) {}

    public record TenantStatusUpdate(@NotNull SubscriptionStatus status) {}

    public record TenantPlanUpdate(@NotNull SubscriptionPlan plan) {}

    public record TrialExtension(@Min(1) int days) {}

    public record CreditTopUp(@Min(1) int credits) {}

    public record PlatformMetrics(long totalTenants, long activeTenants, long trialTenants, long suspendedTenants,
                                  long pendingApproval, BigDecimal mrr, BigDecimal collectedLast30d,
                                  long ticketsToday, long ticketsLast30d, long totalSmsCredits,
                                  long liveConnections, String paymentGateway, long payments24h,
                                  long paymentsFailed24h, Instant lastWebhookAt) {}

    public record NewSuperAdminEmail(@Email String email) {}
}
