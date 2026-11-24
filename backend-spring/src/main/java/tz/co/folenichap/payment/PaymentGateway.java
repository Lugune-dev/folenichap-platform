package tz.co.folenichap.payment;

import java.math.BigDecimal;

/** A Tanzanian payment aggregator able to trigger USSD/STK push on all networks. */
public interface PaymentGateway {

    String name();

    StkPushResult initiate(StkPushRequest request);

    record StkPushRequest(String reference, String msisdn, BigDecimal amount, String currency,
                          MobileProvider provider, String description) {}

    record StkPushResult(boolean accepted, String providerTransactionId, String message) {}
}
