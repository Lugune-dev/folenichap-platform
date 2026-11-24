package tz.co.folenichap.queue;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class QueueDtos {

    private QueueDtos() {}

    // ---------- public booking ----------

    public record PublicServiceView(UUID id, String name, String nameSw, String description, String ticketPrefix,
                                    int avgDurationMinutes, BigDecimal feeAmount, String currency,
                                    boolean requireUpfrontPayment, long waitingCount, int estimatedWaitMinutes,
                                    boolean allowAppointments) {}

    public record PublicBranchView(UUID id, String name, String address, boolean main) {}

    public record PublicTenantView(String slug, String businessName, String logoUrl, String greetingEn,
                                   String greetingSw, String defaultLanguage, boolean acceptingTickets,
                                   boolean paymentsEnabled, UUID branchId, List<PublicBranchView> branches,
                                   List<PublicServiceView> services, long waitingCount,
                                   boolean acceptingAppointments) {}

    public record CreateTicketRequest(
            @NotNull UUID serviceId,
            UUID branchId,
            @NotBlank @Size(max = 120) String customerName,
            @NotBlank @Size(max = 20) String customerPhone,
            @Pattern(regexp = "sw|en") String language,
            /** Mobile money network for STK push: MPESA, TIGOPESA, AIRTEL, HALOPESA, AZAMPESA */
            @Pattern(regexp = "MPESA|TIGOPESA|AIRTEL|HALOPESA|AZAMPESA") String paymentProvider,
            /** Pay optional fee now (fee is always charged when the service requires upfront payment). */
            Boolean payNow) {}

    public record PayTicketRequest(
            @NotBlank @Pattern(regexp = "MPESA|TIGOPESA|AIRTEL|HALOPESA|AZAMPESA") String paymentProvider,
            @Size(max = 20) String payerPhone) {}

    public record TicketStatusView(String trackingToken, String ticketNumber, String status, String paymentStatus,
                                   String serviceName, String serviceNameSw, String businessName, String tenantSlug,
                                   UUID branchId, String branchName, long peopleAhead, int estimatedWaitMinutes,
                                   String counterLabel, Instant joinedAt, Instant calledAt, BigDecimal feeAmount,
                                   String currency, boolean requireUpfrontPayment, String paymentMessage) {}

    // ---------- staff desk ----------

    public record StaffTicketView(UUID id, String ticketNumber, String status, String paymentStatus, UUID serviceId,
                                  String serviceName, String customerName, String customerPhone, String language,
                                  String source, String counterLabel, UUID servedByUserId, Instant joinedAt,
                                  Instant calledAt, Instant serviceStartedAt, Instant completedAt, int recallCount,
                                  boolean requireUpfrontPayment, BigDecimal feeAmount, long version) {}

    public record TodayQueueView(UUID branchId, String queueDate, List<StaffTicketView> waiting,
                                 List<StaffTicketView> called, List<StaffTicketView> serving,
                                 List<StaffTicketView> completed, List<StaffTicketView> noShow,
                                 List<StaffTicketView> cancelled) {}

    public record CallNextRequest(UUID branchId, List<UUID> serviceIds, @Size(max = 50) String counterLabel) {}

    public record CallRequest(@Size(max = 50) String counterLabel) {}

    public record WalkInRequest(@NotNull UUID serviceId, UUID branchId,
                                @NotBlank @Size(max = 120) String customerName,
                                @Size(max = 20) String customerPhone,
                                @Pattern(regexp = "sw|en") String language,
                                @Size(max = 500) String notes) {}

    public record PaymentOverrideRequest(@NotBlank @Pattern(regexp = "PAID_CASH|WAIVED") String action,
                                         @Size(max = 300) String reason) {}

    public record CounterRequest(@NotBlank @Size(max = 50) String counterLabel) {}

    // ---------- admin: services ----------

    public record ServiceRequest(@NotBlank @Size(max = 100) String name,
                                 @Size(max = 100) String nameSw,
                                 @Size(max = 500) String description,
                                 @NotBlank @Pattern(regexp = "^[A-Za-z0-9]{1,5}$") String ticketPrefix,
                                 @Min(1) @Max(600) int avgDurationMinutes,
                                 @NotNull @DecimalMin("0.00") BigDecimal feeAmount,
                                 boolean requireUpfrontPayment,
                                 Integer sortOrder,
                                 Boolean active,
                                 Boolean allowAppointments,
                                 @Min(1) @Max(50) Integer slotCapacity) {}

    public record ServiceView(UUID id, String name, String nameSw, String description, String ticketPrefix,
                              int avgDurationMinutes, BigDecimal feeAmount, String currency,
                              boolean requireUpfrontPayment, int sortOrder, boolean active,
                              boolean allowAppointments, int slotCapacity) {

        static ServiceView of(ServiceOffering s) {
            return new ServiceView(s.getId(), s.getName(), s.getNameSw(), s.getDescription(), s.getTicketPrefix(),
                    s.getAvgDurationMinutes(), s.getFeeAmount(), s.getCurrency(), s.isRequireUpfrontPayment(),
                    s.getSortOrder(), s.isActive(), s.isAllowAppointments(), s.getSlotCapacity());
        }
    }

    // ---------- live board (public, privacy-safe) ----------

    public record BoardTicket(String ticketNumber, String serviceName, String serviceNameSw, String counterLabel,
                              String status, Instant calledAt, int recallCount) {}

    public record BoardServiceStat(UUID serviceId, String name, String nameSw, String prefix, long waiting,
                                   int estimatedWaitMinutes) {}

    public record BoardSnapshot(UUID branchId, String branchName, String businessName, Instant generatedAt,
                                List<BoardTicket> nowServing, List<String> upNext, long waitingCount,
                                List<BoardServiceStat> services, BoardTicket lastCalled, String lastEvent) {}
}
