package tz.co.folenichap.appointment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class AppointmentDtos {

    private AppointmentDtos() {}

    public record SlotView(Instant start, Instant end, int remaining, boolean available) {}

    public record DaySlotsView(LocalDate date, UUID branchId, UUID serviceId, int durationMinutes,
                               LocalDate firstBookableDate, LocalDate lastBookableDate, List<SlotView> slots) {}

    public record BookAppointmentRequest(
            @NotNull UUID serviceId,
            UUID branchId,
            @NotNull Instant startAt,
            @NotBlank @Size(max = 120) String customerName,
            @NotBlank @Size(max = 20) String customerPhone,
            @Pattern(regexp = "sw|en") String language,
            @Size(max = 500) String notes) {}

    /** What the customer sees on /a/{token}. The phone number is masked. */
    public record PublicAppointmentView(String manageToken, String status, String businessName, String tenantSlug,
                                        UUID branchId, String branchName, String branchAddress, UUID serviceId,
                                        String serviceName, String serviceNameSw, String customerName,
                                        String customerPhoneMasked, Instant startAt, Instant endAt,
                                        Instant checkInOpensAt, Instant checkInClosesAt, boolean canCheckIn,
                                        boolean canCancel, String ticketTrackingToken, String ticketNumber,
                                        BigDecimal feeAmount, String currency, boolean requireUpfrontPayment) {}

    public record StaffAppointmentView(UUID id, String status, String source, UUID branchId, UUID serviceId,
                                       String serviceName, String servicePrefix, String customerName,
                                       String customerPhone, String language, Instant startAt, Instant endAt,
                                       String notes, UUID ticketId, String ticketNumber, Instant checkedInAt,
                                       String manageToken) {}

    /** Result of a check-in: the queue ticket the customer now holds. */
    public record CheckInView(String ticketTrackingToken, String ticketNumber, StaffAppointmentView appointment) {}
}
