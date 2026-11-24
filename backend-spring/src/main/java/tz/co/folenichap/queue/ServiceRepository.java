package tz.co.folenichap.queue;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ServiceRepository extends JpaRepository<ServiceOffering, UUID> {

    List<ServiceOffering> findByTenantIdOrderBySortOrderAscNameAsc(UUID tenantId);

    List<ServiceOffering> findByTenantIdAndActiveTrueOrderBySortOrderAscNameAsc(UUID tenantId);

    Optional<ServiceOffering> findByIdAndTenantId(UUID id, UUID tenantId);

    boolean existsByTenantIdAndTicketPrefixAndActiveTrue(UUID tenantId, String prefix);
}
