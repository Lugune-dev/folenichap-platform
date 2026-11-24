package tz.co.folenichap.appointment;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.co.folenichap.appointment.AppointmentDtos.BookAppointmentRequest;
import tz.co.folenichap.appointment.AppointmentDtos.CheckInView;
import tz.co.folenichap.appointment.AppointmentDtos.DaySlotsView;
import tz.co.folenichap.appointment.AppointmentDtos.StaffAppointmentView;
import tz.co.folenichap.security.AuthPrincipal;
import tz.co.folenichap.security.CurrentUser;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Reception view of appointments: list a day, book by phone, check in, cancel, mark no-show. */
@RestController
@RequestMapping("/api/v1/queue/appointments")
@RequiredArgsConstructor
public class StaffAppointmentController {

    private final AppointmentService appointments;

    @GetMapping
    public List<StaffAppointmentView> day(@CurrentUser AuthPrincipal user, @RequestParam(required = false) UUID branchId,
                                          @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return appointments.day(user, branchId, date);
    }

    @GetMapping("/slots")
    public DaySlotsView slots(@CurrentUser AuthPrincipal user, @RequestParam UUID serviceId,
                              @RequestParam(required = false) UUID branchId,
                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return appointments.staffSlots(user, branchId, serviceId, date);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StaffAppointmentView book(@CurrentUser AuthPrincipal user, @Valid @RequestBody BookAppointmentRequest req) {
        return appointments.bookByStaff(user, req);
    }

    @PatchMapping("/{id}/check-in")
    public CheckInView checkIn(@CurrentUser AuthPrincipal user, @PathVariable UUID id) {
        return appointments.checkInByStaff(user, id);
    }

    @PatchMapping("/{id}/cancel")
    public StaffAppointmentView cancel(@CurrentUser AuthPrincipal user, @PathVariable UUID id) {
        return appointments.cancelByStaff(user, id);
    }

    @PatchMapping("/{id}/no-show")
    public StaffAppointmentView noShow(@CurrentUser AuthPrincipal user, @PathVariable UUID id) {
        return appointments.noShowByStaff(user, id);
    }
}
