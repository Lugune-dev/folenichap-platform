package tz.co.folenichap.appointment;

import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.co.folenichap.appointment.AppointmentDtos.BookAppointmentRequest;
import tz.co.folenichap.appointment.AppointmentDtos.CheckInView;
import tz.co.folenichap.appointment.AppointmentDtos.DaySlotsView;
import tz.co.folenichap.appointment.AppointmentDtos.PublicAppointmentView;
import tz.co.folenichap.appointment.AppointmentDtos.SlotView;
import tz.co.folenichap.appointment.AppointmentDtos.StaffAppointmentView;
import tz.co.folenichap.appointment.SlotCalculator.Interval;
import tz.co.folenichap.appointment.SlotCalculator.Slot;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.common.AuditService;
import tz.co.folenichap.common.PhoneNumbers;
import tz.co.folenichap.queue.QueueTicket;
import tz.co.folenichap.queue.QueueTicketRepository;
import tz.co.folenichap.queue.ServiceOffering;
import tz.co.folenichap.queue.ServiceRepository;
import tz.co.folenichap.queue.TicketService;
import tz.co.folenichap.queue.TicketSource;
import tz.co.folenichap.security.AuthPrincipal;
import tz.co.folenichap.tenant.Branch;
import tz.co.folenichap.tenant.BranchRepository;
import tz.co.folenichap.tenant.Tenant;
import tz.co.folenichap.tenant.TenantGuard;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Appointment slots: customers reserve a time, then check in on arrival and receive an ordinary
 * queue ticket. A checked-in customer keeps the queue position of their slot start, so walk-ins who
 * arrived later do not overtake them.
 * <p>
 * Overbooking is impossible: every booking for a branch/service/day takes a transaction-scoped
 * Postgres advisory lock, then counts overlapping bookings before inserting.
 */
@Service
@RequiredArgsConstructor
public class AppointmentService {

    /** How far ahead customers can book. */
    public static final int MAX_DAYS_AHEAD = 30;
    /** Customers cannot book a slot that starts sooner than this. */
    static final Duration PUBLIC_LEAD = Duration.ofMinutes(15);
    /** Self check-in opens this long before the slot starts. */
    static final Duration CHECK_IN_EARLY = Duration.ofMinutes(60);
    /** Self check-in closes this long after the slot starts; staff can still check people in later. */
    static final Duration CHECK_IN_LATE = Duration.ofMinutes(30);

    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppointmentRepository appointments;
    private final TenantGuard tenantGuard;
    private final BranchRepository branches;
    private final ServiceRepository services;
    private final QueueTicketRepository tickets;
    private final TicketService ticketService;
    private final JdbcTemplate jdbc;
    private final ApplicationEventPublisher events;
    private final AuditService audit;

    // ------------------------------------------------------------------ slots

    @Transactional(readOnly = true)
    public DaySlotsView publicSlots(String slug, UUID branchId, UUID serviceId, LocalDate date) {
        Tenant t = tenantGuard.loadBySlug(slug);
        tenantGuard.requireOperational(t);
        Branch b = tenantGuard.resolveBranch(t.getId(), branchId, null);
        ServiceOffering s = bookableService(t.getId(), serviceId);
        return slots(t, b, s, date, Instant.now().plus(PUBLIC_LEAD));
    }

    @Transactional(readOnly = true)
    public DaySlotsView staffSlots(AuthPrincipal user, UUID branchId, UUID serviceId, LocalDate date) {
        UUID tenantId = user.requireTenant();
        Tenant t = tenantGuard.load(tenantId);
        Branch b = tenantGuard.resolveBranch(tenantId, branchId, user.branchId());
        return slots(t, b, activeService(tenantId, serviceId), date, Instant.now());
    }

    private DaySlotsView slots(Tenant t, Branch b, ServiceOffering s, LocalDate date, Instant notBefore) {
        ZoneId zone = t.zone();
        LocalDate today = LocalDate.now(zone);
        LocalDate last = today.plusDays(MAX_DAYS_AHEAD);
        LocalDate day = date == null ? today : date;
        List<SlotView> out = List.of();
        if (!day.isBefore(today) && !day.isAfter(last)) {
            out = SlotCalculator.slots(day, zone, b.getOperatingHours(), s.getAvgDurationMinutes(),
                            s.getSlotCapacity(), booked(b.getId(), s.getId(), day), notBefore).stream()
                    .map(x -> new SlotView(x.start(), x.end(), x.remaining(), x.available()))
                    .toList();
        }
        return new DaySlotsView(day, b.getId(), s.getId(), s.getAvgDurationMinutes(), today, last, out);
    }

    private List<Interval> booked(UUID branchId, UUID serviceId, LocalDate day) {
        return appointments.findByBranchIdAndServiceIdAndAppointmentDateAndStatusIn(branchId, serviceId, day,
                        AppointmentStatus.HOLDING).stream()
                .map(a -> new Interval(a.getStartAt(), a.getEndAt()))
                .toList();
    }

    // ------------------------------------------------------------------ booking

    @Transactional
    public PublicAppointmentView bookPublic(String slug, BookAppointmentRequest req) {
        Tenant t = tenantGuard.loadBySlug(slug);
        tenantGuard.requireOperational(t);
        Branch b = tenantGuard.resolveBranch(t.getId(), req.branchId(), null);
        ServiceOffering s = bookableService(t.getId(), req.serviceId());
        Appointment a = reserve(t, b, s, req, AppointmentSource.WEB, null, Instant.now().plus(PUBLIC_LEAD));
        return publicView(a, t, b, s, null);
    }

    @Transactional
    public StaffAppointmentView bookByStaff(AuthPrincipal user, BookAppointmentRequest req) {
        UUID tenantId = user.requireTenant();
        Tenant t = tenantGuard.requireOperational(tenantId);
        Branch b = tenantGuard.resolveBranch(tenantId, req.branchId(), user.branchId());
        ServiceOffering s = activeService(tenantId, req.serviceId());
        Appointment a = reserve(t, b, s, req, AppointmentSource.STAFF, user.userId(), Instant.now());
        audit.record(tenantId, user.userId(), "APPOINTMENT_BOOKED", "appointment", a.getId(),
                Map.of("startAt", a.getStartAt().toString()));
        return staffView(a, s, null);
    }

    private Appointment reserve(Tenant t, Branch b, ServiceOffering s, BookAppointmentRequest req,
                                AppointmentSource source, UUID userId, Instant notBefore) {
        String phone = PhoneNumbers.normalize(req.customerPhone());
        ZoneId zone = t.zone();
        LocalDate day = req.startAt().atZone(zone).toLocalDate();
        if (day.isAfter(LocalDate.now(zone).plusDays(MAX_DAYS_AHEAD))) {
            throw ApiException.conflict("SLOT_UNAVAILABLE", "Bookings open " + MAX_DAYS_AHEAD + " days ahead");
        }

        lockDay(b.getId(), s.getId(), day);

        // a double-tap returns the same booking; a second, different booking that day is refused
        Optional<Appointment> existing = appointments
                .findFirstByServiceIdAndBranchIdAndAppointmentDateAndCustomerPhoneAndStatusIn(
                        s.getId(), b.getId(), day, phone, AppointmentStatus.HOLDING);
        if (existing.isPresent()) {
            if (existing.get().getStartAt().equals(req.startAt())) {
                return existing.get();
            }
            throw ApiException.conflict("ALREADY_BOOKED",
                    "This phone number already has a booking for this service on that day");
        }

        Slot slot = SlotCalculator.slots(day, zone, b.getOperatingHours(), s.getAvgDurationMinutes(),
                        s.getSlotCapacity(), booked(b.getId(), s.getId(), day), notBefore).stream()
                .filter(x -> x.start().equals(req.startAt()))
                .findFirst()
                .orElseThrow(() -> ApiException.conflict("SLOT_UNAVAILABLE",
                        "This time is not available. Please choose another one."));
        if (!slot.available()) {
            throw ApiException.conflict("SLOT_FULL", "This time has just been taken. Please choose another one.");
        }

        Appointment a = new Appointment();
        a.setTenantId(t.getId());
        a.setBranchId(b.getId());
        a.setServiceId(s.getId());
        a.setManageToken(newToken());
        a.setCustomerName(req.customerName().trim());
        a.setCustomerPhone(phone);
        a.setCustomerLanguage(req.language() == null ? t.getDefaultLanguage() : req.language());
        a.setAppointmentDate(day);
        a.setStartAt(slot.start());
        a.setEndAt(slot.end());
        a.setSource(source);
        a.setNotes(req.notes() == null || req.notes().isBlank() ? null : req.notes().trim());
        a.setCreatedByUserId(userId);
        appointments.save(a);
        events.publishEvent(new AppointmentChangedEvent(t.getId(), a.getId(), AppointmentChangedEvent.Type.BOOKED));
        return a;
    }

    /** Serialises bookings for one branch, service and day until the transaction ends. */
    private void lockDay(UUID branchId, UUID serviceId, LocalDate day) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
                (ResultSetExtractor<Void>) rs -> null, "appt:" + branchId + ":" + serviceId + ":" + day);
    }

    // ------------------------------------------------------------------ customer actions

    @Transactional(readOnly = true)
    public PublicAppointmentView publicStatus(String token) {
        Appointment a = byToken(token);
        Tenant t = tenantGuard.load(a.getTenantId());
        Branch b = branches.findById(a.getBranchId()).orElseThrow(() -> ApiException.notFound("Branch"));
        ServiceOffering s = services.findById(a.getServiceId()).orElseThrow(() -> ApiException.notFound("Service"));
        QueueTicket ticket = a.getTicketId() == null ? null : tickets.findById(a.getTicketId()).orElse(null);
        return publicView(a, t, b, s, ticket);
    }

    @Transactional
    public void cancelByCustomer(String token) {
        Appointment a = byToken(token);
        if (a.getStatus() != AppointmentStatus.BOOKED) {
            throw ApiException.conflict("APPOINTMENT_CLOSED", "This booking can no longer be changed");
        }
        if (!Instant.now().isBefore(a.getStartAt())) {
            throw ApiException.conflict("TOO_LATE_TO_CANCEL", "The appointment time has already started");
        }
        cancel(a, null);
    }

    @Transactional
    public PublicAppointmentView checkInByCustomer(String token) {
        Appointment a = byToken(token);
        Tenant t = tenantGuard.requireOperational(a.getTenantId());
        if (a.getStatus() != AppointmentStatus.CHECKED_IN) {
            if (a.getStatus() != AppointmentStatus.BOOKED) {
                throw ApiException.conflict("APPOINTMENT_CLOSED", "This booking can no longer be changed");
            }
            Instant now = Instant.now();
            if (now.isBefore(a.getStartAt().minus(CHECK_IN_EARLY))) {
                throw ApiException.conflict("CHECK_IN_NOT_OPEN",
                        "Check-in opens " + CHECK_IN_EARLY.toMinutes() + " minutes before your appointment");
            }
            if (now.isAfter(a.getStartAt().plus(CHECK_IN_LATE))) {
                throw ApiException.conflict("CHECK_IN_CLOSED", "Check-in has closed. Please talk to reception.");
            }
            checkIn(t, a, null);
        }
        return publicStatus(token);
    }

    // ------------------------------------------------------------------ staff actions

    @Transactional(readOnly = true)
    public List<StaffAppointmentView> day(AuthPrincipal user, UUID branchId, LocalDate date) {
        UUID tenantId = user.requireTenant();
        Tenant t = tenantGuard.load(tenantId);
        Branch b = tenantGuard.resolveBranch(tenantId, branchId, user.branchId());
        LocalDate day = date == null ? LocalDate.now(t.zone()) : date;
        List<Appointment> list = appointments.findByTenantIdAndBranchIdAndAppointmentDateOrderByStartAtAsc(
                tenantId, b.getId(), day);
        Map<UUID, ServiceOffering> svc = services.findByTenantIdOrderBySortOrderAscNameAsc(tenantId).stream()
                .collect(Collectors.toMap(ServiceOffering::getId, Function.identity()));
        Map<UUID, QueueTicket> issued = tickets.findAllById(list.stream().map(Appointment::getTicketId)
                        .filter(Objects::nonNull).toList()).stream()
                .collect(Collectors.toMap(QueueTicket::getId, Function.identity()));
        return list.stream()
                .map(a -> staffView(a, svc.get(a.getServiceId()), a.getTicketId() == null ? null : issued.get(a.getTicketId())))
                .toList();
    }

    @Transactional
    public CheckInView checkInByStaff(AuthPrincipal user, UUID id) {
        UUID tenantId = user.requireTenant();
        Tenant t = tenantGuard.requireOperational(tenantId);
        Appointment a = load(tenantId, id);
        if (a.getStatus() != AppointmentStatus.BOOKED && a.getStatus() != AppointmentStatus.NO_SHOW) {
            throw ApiException.conflict("APPOINTMENT_CLOSED", "This booking can no longer be checked in");
        }
        if (!a.getAppointmentDate().equals(LocalDate.now(t.zone()))) {
            throw ApiException.conflict("NOT_TODAY", "Only today's appointments can be checked in");
        }
        QueueTicket ticket = checkIn(t, a, user.userId());
        ServiceOffering s = services.findByIdAndTenantId(a.getServiceId(), tenantId).orElse(null);
        return new CheckInView(ticket.getTrackingToken(), ticket.getTicketNumber(), staffView(a, s, ticket));
    }

    @Transactional
    public StaffAppointmentView cancelByStaff(AuthPrincipal user, UUID id) {
        UUID tenantId = user.requireTenant();
        Appointment a = load(tenantId, id);
        if (a.getStatus() != AppointmentStatus.BOOKED) {
            throw ApiException.conflict("APPOINTMENT_CLOSED", "Only booked appointments can be cancelled");
        }
        cancel(a, user.userId());
        return staffView(a, services.findByIdAndTenantId(a.getServiceId(), tenantId).orElse(null), null);
    }

    @Transactional
    public StaffAppointmentView noShowByStaff(AuthPrincipal user, UUID id) {
        UUID tenantId = user.requireTenant();
        Appointment a = load(tenantId, id);
        if (a.getStatus() != AppointmentStatus.BOOKED) {
            throw ApiException.conflict("APPOINTMENT_CLOSED", "Only booked appointments can be marked as no-show");
        }
        a.setStatus(AppointmentStatus.NO_SHOW);
        events.publishEvent(new AppointmentChangedEvent(tenantId, a.getId(), AppointmentChangedEvent.Type.NO_SHOW));
        audit.record(tenantId, user.userId(), "APPOINTMENT_NO_SHOW", "appointment", a.getId(), Map.of());
        return staffView(a, services.findByIdAndTenantId(a.getServiceId(), tenantId).orElse(null), null);
    }

    // ------------------------------------------------------------------ helpers

    private QueueTicket checkIn(Tenant t, Appointment a, UUID userId) {
        Branch b = branches.findByIdAndTenantId(a.getBranchId(), t.getId()).orElseThrow(() -> ApiException.notFound("Branch"));
        ServiceOffering s = activeService(t.getId(), a.getServiceId());
        Instant now = Instant.now();
        // on time (or within the grace period): queue position = slot start; very late: back of the queue
        boolean onTime = !now.isAfter(a.getStartAt().plus(CHECK_IN_LATE));
        QueueTicket ticket = ticketService.issue(t, b, s, a.getCustomerName(), a.getCustomerPhone(),
                a.getCustomerLanguage(), TicketSource.APPOINTMENT, a.getNotes(), onTime ? a.getStartAt() : null);
        a.setStatus(AppointmentStatus.CHECKED_IN);
        a.setCheckedInAt(now);
        a.setTicketId(ticket.getId());
        events.publishEvent(new AppointmentChangedEvent(t.getId(), a.getId(), AppointmentChangedEvent.Type.CHECKED_IN));
        audit.record(t.getId(), userId, "APPOINTMENT_CHECKED_IN", "appointment", a.getId(),
                Map.of("ticket", ticket.getTicketNumber()));
        return ticket;
    }

    private void cancel(Appointment a, UUID userId) {
        a.setStatus(AppointmentStatus.CANCELLED);
        a.setCancelledAt(Instant.now());
        events.publishEvent(new AppointmentChangedEvent(a.getTenantId(), a.getId(), AppointmentChangedEvent.Type.CANCELLED));
        audit.record(a.getTenantId(), userId, "APPOINTMENT_CANCELLED", "appointment", a.getId(),
                Map.of("by", userId == null ? "customer" : "staff"));
    }

    private Appointment byToken(String token) {
        return appointments.findByManageToken(token).orElseThrow(() -> ApiException.notFound("Appointment"));
    }

    private Appointment load(UUID tenantId, UUID id) {
        return appointments.findByIdAndTenantId(id, tenantId).orElseThrow(() -> ApiException.notFound("Appointment"));
    }

    private ServiceOffering bookableService(UUID tenantId, UUID serviceId) {
        ServiceOffering s = activeService(tenantId, serviceId);
        if (!s.isAllowAppointments()) {
            throw ApiException.conflict("NOT_BOOKABLE", "This service cannot be booked in advance");
        }
        return s;
    }

    private ServiceOffering activeService(UUID tenantId, UUID serviceId) {
        return services.findByIdAndTenantId(serviceId, tenantId)
                .filter(ServiceOffering::isActive)
                .orElseThrow(() -> ApiException.notFound("Service"));
    }

    private static PublicAppointmentView publicView(Appointment a, Tenant t, Branch b, ServiceOffering s, QueueTicket ticket) {
        Instant now = Instant.now();
        boolean booked = a.getStatus() == AppointmentStatus.BOOKED;
        Instant opens = a.getStartAt().minus(CHECK_IN_EARLY);
        Instant closes = a.getStartAt().plus(CHECK_IN_LATE);
        return new PublicAppointmentView(a.getManageToken(), a.getStatus().name(), t.getBusinessName(), t.getSlug(),
                b.getId(), b.getName(), b.getAddress(), s.getId(), s.getName(), s.getNameSw(), a.getCustomerName(),
                PhoneNumbers.mask(a.getCustomerPhone()), a.getStartAt(), a.getEndAt(), opens, closes,
                booked && !now.isBefore(opens) && !now.isAfter(closes), booked && now.isBefore(a.getStartAt()),
                ticket == null ? null : ticket.getTrackingToken(), ticket == null ? null : ticket.getTicketNumber(),
                s.getFeeAmount(), s.getCurrency(), s.isRequireUpfrontPayment());
    }

    private static StaffAppointmentView staffView(Appointment a, ServiceOffering s, QueueTicket ticket) {
        return new StaffAppointmentView(a.getId(), a.getStatus().name(), a.getSource().name(), a.getBranchId(),
                a.getServiceId(), s == null ? null : s.getName(), s == null ? null : s.getTicketPrefix(),
                a.getCustomerName(), a.getCustomerPhone(), a.getCustomerLanguage(), a.getStartAt(), a.getEndAt(),
                a.getNotes(), a.getTicketId(), ticket == null ? null : ticket.getTicketNumber(), a.getCheckedInAt(),
                a.getManageToken());
    }

    private static String newToken() {
        byte[] b = new byte[12];
        RANDOM.nextBytes(b);
        return HexFormat.of().formatHex(b); // 24 hex chars
    }
}
