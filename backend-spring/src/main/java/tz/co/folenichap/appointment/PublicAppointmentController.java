package tz.co.folenichap.appointment;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.co.folenichap.appointment.AppointmentDtos.BookAppointmentRequest;
import tz.co.folenichap.appointment.AppointmentDtos.DaySlotsView;
import tz.co.folenichap.appointment.AppointmentDtos.PublicAppointmentView;
import tz.co.folenichap.queue.PublicRateLimiter;

import java.time.LocalDate;
import java.util.UUID;

/** Anonymous endpoints for booking a time slot and managing it from the link the customer receives. */
@RestController
@RequestMapping("/api/v1/public")
@RequiredArgsConstructor
public class PublicAppointmentController {

    private final AppointmentService appointments;
    private final PublicRateLimiter rateLimiter;

    /** Free and taken slots for one service on one day. */
    @GetMapping("/tenants/{slug}/slots")
    public DaySlotsView slots(@PathVariable String slug, @RequestParam UUID serviceId,
                              @RequestParam(required = false) UUID branchId,
                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return appointments.publicSlots(slug, branchId, serviceId, date);
    }

    @PostMapping("/tenants/{slug}/appointments")
    @ResponseStatus(HttpStatus.CREATED)
    public PublicAppointmentView book(@PathVariable String slug, @Valid @RequestBody BookAppointmentRequest req,
                                      HttpServletRequest http) {
        rateLimiter.check("appt-ip:" + http.getRemoteAddr());
        rateLimiter.check("appt-phone:" + req.customerPhone().replaceAll("[^0-9]", ""), 3);
        return appointments.bookPublic(slug, req);
    }

    @GetMapping("/appointments/{token}")
    public PublicAppointmentView status(@PathVariable String token) {
        return appointments.publicStatus(token);
    }

    /** Customer has arrived: issues their queue ticket. */
    @PostMapping("/appointments/{token}/check-in")
    public PublicAppointmentView checkIn(@PathVariable String token) {
        rateLimiter.check("appt-checkin:" + token, 5);
        return appointments.checkInByCustomer(token);
    }

    @PostMapping("/appointments/{token}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable String token) {
        appointments.cancelByCustomer(token);
    }
}
