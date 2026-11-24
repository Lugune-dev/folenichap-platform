package tz.co.folenichap.payment;

/** Tanzanian mobile money networks (Tigo Pesa is now branded "Mixx by Yas"). */
public enum MobileProvider {
    MPESA("Mpesa"), TIGOPESA("Tigo"), AIRTEL("Airtel"), HALOPESA("Halopesa"), AZAMPESA("Azampesa"),
    CASH(null), MOCK(null);

    private final String azamPayCode;

    MobileProvider(String azamPayCode) {
        this.azamPayCode = azamPayCode;
    }

    public String azamPayCode() {
        return azamPayCode;
    }

    /** Best-effort network detection from a normalized 255XXXXXXXXX number. */
    public static MobileProvider detect(String msisdn) {
        if (msisdn == null || msisdn.length() < 6 || !msisdn.startsWith("255")) {
            return MPESA;
        }
        String p = msisdn.substring(3, 5);
        return switch (p) {
            case "74", "75", "76" -> MPESA;
            case "65", "67", "71", "77" -> TIGOPESA;
            case "68", "69", "78" -> AIRTEL;
            case "61", "62" -> HALOPESA;
            default -> MPESA;
        };
    }
}
