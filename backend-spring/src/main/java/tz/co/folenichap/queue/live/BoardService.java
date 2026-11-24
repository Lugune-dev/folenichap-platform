package tz.co.folenichap.queue.live;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.co.folenichap.queue.QueueDtos.BoardServiceStat;
import tz.co.folenichap.queue.QueueDtos.BoardSnapshot;
import tz.co.folenichap.queue.QueueDtos.BoardTicket;
import tz.co.folenichap.queue.QueueTicket;
import tz.co.folenichap.queue.QueueTicketRepository;
import tz.co.folenichap.queue.ServiceOffering;
import tz.co.folenichap.queue.ServiceRepository;
import tz.co.folenichap.queue.TicketStatus;
import tz.co.folenichap.queue.WaitEstimator;
import tz.co.folenichap.tenant.Branch;
import tz.co.folenichap.tenant.BranchRepository;
import tz.co.folenichap.tenant.Tenant;
import tz.co.folenichap.tenant.TenantRepository;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Builds the privacy-safe live board (ticket numbers only, never names or phones). */
@Service
@RequiredArgsConstructor
public class BoardService {

    private final TenantRepository tenants;
    private final BranchRepository branches;
    private final ServiceRepository services;
    private final QueueTicketRepository tickets;
    private final WaitEstimator estimator;

    @Transactional(readOnly = true)
    public BoardSnapshot snapshot(UUID tenantId, UUID branchId, String lastEvent) {
        Tenant tenant = tenants.findById(tenantId).orElseThrow();
        Branch branch = branches.findByIdAndTenantId(branchId, tenantId).orElseThrow();
        LocalDate today = LocalDate.now(tenant.zone());

        Map<UUID, ServiceOffering> svc = services.findByTenantIdOrderBySortOrderAscNameAsc(tenantId).stream()
                .collect(Collectors.toMap(ServiceOffering::getId, Function.identity()));

        List<QueueTicket> active = tickets.findByTenantIdAndBranchIdAndQueueDateAndStatusInOrderByCalledAtDesc(
                tenantId, branchId, today, EnumSet.of(TicketStatus.CALLED, TicketStatus.SERVING));
        List<QueueTicket> waiting = tickets.findByTenantIdAndBranchIdAndQueueDateAndStatusOrderByJoinedAtAsc(
                tenantId, branchId, today, TicketStatus.WAITING);

        List<BoardTicket> nowServing = active.stream()
                .sorted(Comparator.comparing(QueueTicket::getCalledAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(t -> board(t, svc.get(t.getServiceId())))
                .toList();

        long agents = tickets.countActiveAgents(branchId, today, Instant.now().minus(Duration.ofMinutes(60)));
        Map<UUID, Long> waitingByService = waiting.stream()
                .collect(Collectors.groupingBy(QueueTicket::getServiceId, Collectors.counting()));
        List<BoardServiceStat> stats = svc.values().stream()
                .filter(ServiceOffering::isActive)
                .sorted(Comparator.comparingInt(ServiceOffering::getSortOrder).thenComparing(ServiceOffering::getName))
                .map(s -> {
                    long w = waitingByService.getOrDefault(s.getId(), 0L);
                    return new BoardServiceStat(s.getId(), s.getName(), s.getNameSw(), s.getTicketPrefix(), w,
                            estimator.estimateMinutes(w, s.getAvgDurationMinutes(), agents));
                })
                .toList();

        return new BoardSnapshot(branchId, branch.getName(), tenant.getBusinessName(), Instant.now(),
                nowServing,
                waiting.stream().limit(10).map(QueueTicket::getTicketNumber).toList(),
                waiting.size(),
                stats,
                nowServing.isEmpty() ? null : nowServing.get(0),
                lastEvent);
    }

    private BoardTicket board(QueueTicket t, ServiceOffering s) {
        return new BoardTicket(t.getTicketNumber(), s == null ? null : s.getName(), s == null ? null : s.getNameSw(),
                t.getCounterLabel(), t.getStatus().name(), t.getCalledAt(), t.getRecallCount());
    }
}
