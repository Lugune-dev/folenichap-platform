package tz.co.folenichap.tenant;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BranchRepository extends JpaRepository<Branch, UUID> {

    List<Branch> findByTenantIdOrderByMainDescNameAsc(UUID tenantId);

    List<Branch> findByTenantIdAndActiveTrueOrderByMainDescNameAsc(UUID tenantId);

    Optional<Branch> findByIdAndTenantId(UUID id, UUID tenantId);

    Optional<Branch> findFirstByTenantIdAndMainTrue(UUID tenantId);

    long countByTenantIdAndActiveTrue(UUID tenantId);
}
