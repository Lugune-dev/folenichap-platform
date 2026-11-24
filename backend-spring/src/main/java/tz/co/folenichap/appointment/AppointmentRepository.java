package tz.co.folenichap.appointment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AppointmentRepository extends JpaRepository<Appointment, UUID> {

    Optional<Appointment> findByManageToken(String manageToken);

    Optional<Appointment> findByIdAndTenantId(UUID id, UUID tenantId);

    List<Appointment> findByTenantIdAndBranchIdAndAppointmentDateOrderByStartAtAsc(UUID tenantId, UUID branchId,
                                                                                   LocalDate date);

    /** Bookings that hold capacity on a given day, used to work out free slots. */
    List<Appointment> findByBranchIdAndServiceIdAndAppointmentDateAndStatusIn(UUID branchId, UUID serviceId,
                                                                              LocalDate date,
                                                                              Collection<AppointmentStatus> statuses);

    /** Bookings that overlap [start, end): the slot's current occupancy. */
    @Query("""
            select count(a) from Appointment a
            where a.branchId = :branchId and a.serviceId = :serviceId and a.status in :statuses
              and a.startAt < :end and a.endAt > :start
            """)
    long countOverlapping(@Param("branchId") UUID branchId, @Param("serviceId") UUID serviceId,
                          @Param("start") Instant start, @Param("end") Instant end,
                          @Param("statuses") Collection<AppointmentStatus> statuses);

    Optional<Appointment> findFirstByServiceIdAndBranchIdAndAppointmentDateAndCustomerPhoneAndStatusIn(
            UUID serviceId, UUID branchId, LocalDate date, String phone, Collection<AppointmentStatus> statuses);

    /** Booked appointments starting within the reminder window that have not been reminded yet. */
    @Query("""
            select a from Appointment a
            where a.status = tz.co.folenichap.appointment.AppointmentStatus.BOOKED and a.reminderSent = false
              and a.startAt > :now and a.startAt <= :until
            """)
    List<Appointment> findDueReminders(@Param("now") Instant now, @Param("until") Instant until);

    /** Claims a reminder atomically so two instances never send it twice. */
    @Modifying
    @Query(value = "UPDATE appointments SET reminder_sent = TRUE WHERE id = :id AND reminder_sent = FALSE",
            nativeQuery = true)
    int claimReminder(@Param("id") UUID id);

    /** Customers who never arrived: their slot ended more than the grace period ago. */
    @Modifying
    @Query(value = """
            UPDATE appointments SET status = 'NO_SHOW', version = version + 1
            WHERE status = 'BOOKED' AND end_at < :cutoff
            """, nativeQuery = true)
    int markNoShows(@Param("cutoff") Instant cutoff);
}
