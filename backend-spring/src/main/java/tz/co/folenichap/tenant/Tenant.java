package tz.co.folenichap.tenant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tenants")
@Getter
@Setter
public class Tenant {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "business_name", nullable = false)
    private String businessName;

    @Column(nullable = false, unique = true)
    private String slug;

    @Column(nullable = false)
    private String phone;

    @Column(nullable = false)
    private String email;

    @Column(name = "business_category")
    private String businessCategory;

    @Column(name = "logo_url")
    private String logoUrl;

    @Column(name = "greeting_en")
    private String greetingEn;

    @Column(name = "greeting_sw")
    private String greetingSw;

    @Column(name = "default_language", nullable = false)
    private String defaultLanguage = "sw";

    @Column(nullable = false)
    private String timezone = "Africa/Dar_es_Salaam";

    @Enumerated(EnumType.STRING)
    @Column(name = "subscription_plan", nullable = false)
    private SubscriptionPlan subscriptionPlan = SubscriptionPlan.STARTER;

    @Enumerated(EnumType.STRING)
    @Column(name = "subscription_status", nullable = false)
    private SubscriptionStatus subscriptionStatus = SubscriptionStatus.TRIAL;

    @Column(name = "trial_ends_at", nullable = false)
    private Instant trialEndsAt;

    @Column(name = "current_period_ends_at")
    private Instant currentPeriodEndsAt;

    @Column(name = "sms_credits", nullable = false)
    private int smsCredits = 50;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    /**
     * During the trial every tenant gets PRO features so they can experience alerts and payments
     * (the conversion strategy in the blueprint: convert to Pro on day 10).
     */
    public SubscriptionPlan effectivePlan() {
        return subscriptionStatus == SubscriptionStatus.TRIAL ? SubscriptionPlan.PRO : subscriptionPlan;
    }

    public java.time.ZoneId zone() {
        return java.time.ZoneId.of(timezone);
    }
}
