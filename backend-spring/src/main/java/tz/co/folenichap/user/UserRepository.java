package tz.co.folenichap.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<AppUser, UUID> {

    @Query("select u from AppUser u where lower(u.email) = lower(?1)")
    Optional<AppUser> findByEmailIgnoreCase(String email);

    @Query("select case when count(u) > 0 then true else false end from AppUser u where lower(u.email) = lower(?1)")
    boolean existsByEmailIgnoreCase(String email);

    Optional<AppUser> findByIdAndTenantId(UUID id, UUID tenantId);

    List<AppUser> findByTenantIdOrderByRoleAscFullNameAsc(UUID tenantId);

    long countByTenantIdAndRoleAndActiveTrue(UUID tenantId, Role role);

    boolean existsByRole(Role role);

    Optional<AppUser> findFirstByTenantIdAndRoleOrderByCreatedAtAsc(UUID tenantId, Role role);
}
