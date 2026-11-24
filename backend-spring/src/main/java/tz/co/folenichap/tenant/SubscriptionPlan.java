package tz.co.folenichap.tenant;

/** Commercial plans and their feature limits (see blueprint section 2). */
public enum SubscriptionPlan {

    /** TZS 35,000 / month: 1 branch, up to 3 counters/agents, no paid alerts or MoMo collection. */
    STARTER(1, 3, false, false),

    /** TZS 75,000 / month: up to 3 branches, unlimited counters, WhatsApp/SMS alerts, MoMo booking fees. */
    PRO(3, Integer.MAX_VALUE, true, true);

    private final int maxBranches;
    private final int maxStaff;
    private final boolean notificationsEnabled;
    private final boolean paymentsEnabled;

    SubscriptionPlan(int maxBranches, int maxStaff, boolean notificationsEnabled, boolean paymentsEnabled) {
        this.maxBranches = maxBranches;
        this.maxStaff = maxStaff;
        this.notificationsEnabled = notificationsEnabled;
        this.paymentsEnabled = paymentsEnabled;
    }

    public int maxBranches() { return maxBranches; }
    public int maxStaff() { return maxStaff; }
    public boolean notificationsEnabled() { return notificationsEnabled; }
    public boolean paymentsEnabled() { return paymentsEnabled; }
}
