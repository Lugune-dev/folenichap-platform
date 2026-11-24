package tz.co.folenichap.queue;

public enum PaymentStatus {
    UNPAID, PENDING, PAID, WAIVED;

    public boolean isSettled() {
        return this == PAID || this == WAIVED;
    }
}
