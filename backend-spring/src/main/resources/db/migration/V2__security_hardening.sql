-- Defence in depth: a platform owner (SUPER_ADMIN) is never tied to a business, and every other
-- role always is. Blocks privilege escalation even if application code is ever wrong.
ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_tenant;
ALTER TABLE users ADD CONSTRAINT ck_users_tenant CHECK (
    (role = 'SUPER_ADMIN' AND tenant_id IS NULL) OR (role <> 'SUPER_ADMIN' AND tenant_id IS NOT NULL)
);

-- Fast lookups of failed sign-ins for security monitoring.
CREATE INDEX IF NOT EXISTS idx_audit_action_created ON audit_log (action, created_at);
