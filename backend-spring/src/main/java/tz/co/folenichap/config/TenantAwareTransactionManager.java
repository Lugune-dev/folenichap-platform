package tz.co.folenichap.config;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.Session;
import org.springframework.orm.jpa.EntityManagerHolder;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tz.co.folenichap.common.TenantScopedEntity;
import tz.co.folenichap.security.TenantContext;

import java.util.UUID;

/**
 * Enables the Hibernate {@code tenantFilter} on every transaction started while a
 * tenant is bound to the current thread (set by the JWT filter).
 * <p>
 * This is defense-in-depth: repositories also take tenantId explicitly, so even a
 * query that bypasses the filter (e.g. {@code em.find}) cannot leak across tenants.
 */
public class TenantAwareTransactionManager extends JpaTransactionManager {

    public TenantAwareTransactionManager(EntityManagerFactory emf) {
        super(emf);
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
        super.doBegin(transaction, definition);
        UUID tenantId = TenantContext.getTenantId();
        if (tenantId == null) {
            return;
        }
        EntityManagerFactory emf = getEntityManagerFactory();
        if (emf == null) {
            return;
        }
        Object resource = TransactionSynchronizationManager.getResource(emf);
        if (resource instanceof EntityManagerHolder holder) {
            Session session = holder.getEntityManager().unwrap(Session.class);
            session.enableFilter(TenantScopedEntity.TENANT_FILTER)
                    .setParameter(TenantScopedEntity.TENANT_PARAM, tenantId);
        }
    }
}
