package tz.co.folenichap.common;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Savepoint;
import java.sql.Types;
import java.util.Map;
import java.util.UUID;

/** Lightweight append-only audit trail (who did what, when). */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private static final String INSERT_SQL = """
            INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb))
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final EntityManager entityManager;

    public void record(UUID tenantId, UUID userId, String action, String entityType, UUID entityId,
                       Map<String, ?> details) {
        boolean inTx = TransactionSynchronizationManager.isActualTransactionActive();
        // The audit row is written with plain JDBC and references tenants/users by FK.
        // Push pending JPA inserts (e.g. a tenant created in this same transaction) to the DB first.
        if (inTx) {
            entityManager.flush();
        }
        try {
            String json = details == null ? null : objectMapper.writeValueAsString(details);
            jdbc.execute((ConnectionCallback<Void>) con -> {
                // Savepoint: if the audit insert fails, PostgreSQL would otherwise abort the
                // caller's whole transaction. Roll back only the audit row instead.
                Savepoint sp = inTx ? con.setSavepoint() : null;
                try (PreparedStatement ps = con.prepareStatement(INSERT_SQL)) {
                    ps.setObject(1, tenantId, Types.OTHER);
                    ps.setObject(2, userId, Types.OTHER);
                    ps.setString(3, action);
                    ps.setString(4, entityType);
                    ps.setObject(5, entityId, Types.OTHER);
                    ps.setString(6, json);
                    ps.executeUpdate();
                    if (sp != null) con.releaseSavepoint(sp);
                } catch (SQLException e) {
                    if (sp != null) con.rollback(sp);
                    throw e;
                }
                return null;
            });
        } catch (JsonProcessingException | RuntimeException e) {
            // auditing must never break the business operation
            log.warn("Audit write failed for {}: {}", action, e.getMessage());
        }
    }
}
