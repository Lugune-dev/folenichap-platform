package tz.co.folenichap.tenant;

public enum SubscriptionStatus {
    PENDING_APPROVAL, TRIAL, ACTIVE, PAST_DUE, SUSPENDED;

    /** Whether the tenant may operate queues (staff desk + public booking). */
    public boolean canOperate() {
        return this == TRIAL || this == ACTIVE || this == PAST_DUE;
    }
}
