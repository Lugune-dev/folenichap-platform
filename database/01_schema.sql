-- =====================================================================
-- FoleniChap SaaS - V1 initial schema
-- Target: PostgreSQL 16 (works on Neon, Supabase, Aiven, RDS, local)
-- Multi-tenancy: shared schema, mandatory tenant_id on business tables
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Tenants (registered businesses)
-- ---------------------------------------------------------------------
CREATE TABLE tenants (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name           VARCHAR(150) NOT NULL,
    slug                    VARCHAR(100) NOT NULL,
    phone                   VARCHAR(20)  NOT NULL,
    email                   VARCHAR(150) NOT NULL,
    business_category       VARCHAR(50),
    logo_url                VARCHAR(500),
    greeting_en             VARCHAR(500),
    greeting_sw             VARCHAR(500),
    default_language        VARCHAR(5)   NOT NULL DEFAULT 'sw',
    timezone                VARCHAR(50)  NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
    subscription_plan       VARCHAR(30)  NOT NULL DEFAULT 'STARTER',
    subscription_status     VARCHAR(30)  NOT NULL DEFAULT 'TRIAL',
    trial_ends_at           TIMESTAMPTZ  NOT NULL,
    current_period_ends_at  TIMESTAMPTZ,
    sms_credits             INT          NOT NULL DEFAULT 50,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_tenants_slug  UNIQUE (slug),
    CONSTRAINT ck_tenants_slug  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT ck_tenants_plan  CHECK (subscription_plan IN ('STARTER', 'PRO')),
    CONSTRAINT ck_tenants_status CHECK (subscription_status IN ('PENDING_APPROVAL', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED')),
    CONSTRAINT ck_tenants_lang  CHECK (default_language IN ('sw', 'en')),
    CONSTRAINT ck_tenants_credits CHECK (sms_credits >= 0)
);
CREATE UNIQUE INDEX uq_tenants_email_ci ON tenants (lower(email));

-- ---------------------------------------------------------------------
-- 2. Branches
-- ---------------------------------------------------------------------
CREATE TABLE branches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(120) NOT NULL,
    address         VARCHAR(255),
    phone           VARCHAR(20),
    operating_hours JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"mon":{"open":"08:00","close":"18:00"},...}
    is_main         BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_branches_tenant ON branches (tenant_id);
-- at most one main branch per tenant
CREATE UNIQUE INDEX uq_branches_main ON branches (tenant_id) WHERE is_main;

-- ---------------------------------------------------------------------
-- 3. Users (SUPER_ADMIN has no tenant)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
    full_name       VARCHAR(120) NOT NULL,
    email           VARCHAR(150) NOT NULL,
    phone           VARCHAR(20),
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(30)  NOT NULL,
    counter_label   VARCHAR(50),
    preferred_language VARCHAR(5) NOT NULL DEFAULT 'sw',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_users_role CHECK (role IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'STAFF')),
    CONSTRAINT ck_users_tenant CHECK (role = 'SUPER_ADMIN' OR tenant_id IS NOT NULL)
);
CREATE UNIQUE INDEX uq_users_email_ci ON users (lower(email));
CREATE INDEX idx_users_tenant ON users (tenant_id);

-- ---------------------------------------------------------------------
-- 4. Refresh tokens (rotated, stored as SHA-256 hash)
-- ---------------------------------------------------------------------
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

-- ---------------------------------------------------------------------
-- 5. Services offered by a tenant
-- ---------------------------------------------------------------------
CREATE TABLE services (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                    VARCHAR(100) NOT NULL,
    name_sw                 VARCHAR(100),
    description             VARCHAR(500),
    ticket_prefix           VARCHAR(5)   NOT NULL,
    avg_duration_minutes    INT          NOT NULL DEFAULT 15,
    fee_amount              NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    require_upfront_payment BOOLEAN      NOT NULL DEFAULT FALSE,
    currency                VARCHAR(10)  NOT NULL DEFAULT 'TZS',
    sort_order              INT          NOT NULL DEFAULT 0,
    is_active               BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_services_prefix   CHECK (ticket_prefix ~ '^[A-Z0-9]{1,5}$'),
    CONSTRAINT ck_services_duration CHECK (avg_duration_minutes BETWEEN 1 AND 600),
    CONSTRAINT ck_services_fee      CHECK (fee_amount >= 0),
    CONSTRAINT ck_services_upfront  CHECK (NOT require_upfront_payment OR fee_amount > 0)
);
CREATE UNIQUE INDEX uq_services_prefix ON services (tenant_id, ticket_prefix) WHERE is_active;
CREATE INDEX idx_services_tenant ON services (tenant_id);

-- ---------------------------------------------------------------------
-- 6. Ticket sequences (atomic per-branch/service/day numbering)
-- ---------------------------------------------------------------------
CREATE TABLE ticket_sequences (
    branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    service_id  UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    queue_date  DATE NOT NULL,
    last_number INT  NOT NULL,
    PRIMARY KEY (branch_id, service_id, queue_date)
);

-- ---------------------------------------------------------------------
-- 7. Queue tickets (core transactional table)
-- ---------------------------------------------------------------------
CREATE TABLE queue_tickets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES branches(id),
    service_id          UUID NOT NULL REFERENCES services(id),
    served_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    ticket_number       VARCHAR(20)  NOT NULL,               -- e.g. 'D-001'
    sequence_no         INT          NOT NULL,
    tracking_token      VARCHAR(32)  NOT NULL,               -- unguessable public id
    customer_name       VARCHAR(120) NOT NULL,
    customer_phone      VARCHAR(20)  NOT NULL,
    customer_language   VARCHAR(5)   NOT NULL DEFAULT 'sw',
    source              VARCHAR(20)  NOT NULL DEFAULT 'QR',
    status              VARCHAR(30)  NOT NULL DEFAULT 'WAITING',
    payment_status      VARCHAR(30)  NOT NULL DEFAULT 'UNPAID',
    counter_label       VARCHAR(50),
    queue_date          DATE         NOT NULL,
    joined_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    called_at           TIMESTAMPTZ,
    service_started_at  TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    recall_count        INT          NOT NULL DEFAULT 0,
    near_turn_notified  BOOLEAN      NOT NULL DEFAULT FALSE,
    notes               VARCHAR(500),
    version             BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_tickets_tracking UNIQUE (tracking_token),
    CONSTRAINT uq_tickets_number   UNIQUE (branch_id, service_id, queue_date, sequence_no),
    CONSTRAINT ck_tickets_status   CHECK (status IN ('WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'NO_SHOW', 'CANCELLED')),
    CONSTRAINT ck_tickets_payment  CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'WAIVED')),
    CONSTRAINT ck_tickets_source   CHECK (source IN ('QR', 'WALK_IN', 'WHATSAPP', 'WEB')),
    CONSTRAINT ck_tickets_lang     CHECK (customer_language IN ('sw', 'en'))
);
CREATE INDEX idx_tickets_lookup  ON queue_tickets (tenant_id, queue_date, status);
CREATE INDEX idx_tickets_waiting ON queue_tickets (branch_id, queue_date, joined_at) WHERE status = 'WAITING';
CREATE INDEX idx_tickets_served_by ON queue_tickets (served_by_user_id, queue_date);

-- ---------------------------------------------------------------------
-- 8. Payments ledger (booking fees & SaaS subscriptions)
-- ---------------------------------------------------------------------
CREATE TABLE payments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    ticket_id               UUID REFERENCES queue_tickets(id) ON DELETE SET NULL,
    payment_type            VARCHAR(30)  NOT NULL,
    provider                VARCHAR(50)  NOT NULL,
    gateway                 VARCHAR(30)  NOT NULL DEFAULT 'AZAMPAY',
    msisdn                  VARCHAR(20),
    external_reference      VARCHAR(150) NOT NULL,
    provider_transaction_id VARCHAR(150),
    amount                  NUMERIC(12, 2) NOT NULL,
    currency                VARCHAR(10)  NOT NULL DEFAULT 'TZS',
    status                  VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
    failure_reason          VARCHAR(500),
    paid_at                 TIMESTAMPTZ,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_payments_ref     UNIQUE (external_reference),
    CONSTRAINT ck_payments_type    CHECK (payment_type IN ('BOOKING_FEE', 'SAAS_SUBSCRIPTION', 'SMS_CREDITS')),
    CONSTRAINT ck_payments_provider CHECK (provider IN ('MPESA', 'TIGOPESA', 'AIRTEL', 'HALOPESA', 'AZAMPESA', 'CASH', 'MOCK')),
    CONSTRAINT ck_payments_status  CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    CONSTRAINT ck_payments_amount  CHECK (amount > 0)
);
CREATE INDEX idx_payments_tenant_created ON payments (tenant_id, created_at);
CREATE INDEX idx_payments_ticket ON payments (ticket_id);

-- ---------------------------------------------------------------------
-- 9. Webhook events (idempotency + audit of gateway callbacks)
-- ---------------------------------------------------------------------
CREATE TABLE webhook_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway         VARCHAR(30)  NOT NULL,
    event_key       VARCHAR(200) NOT NULL,
    payload         JSONB        NOT NULL,
    signature_valid BOOLEAN      NOT NULL,
    source_ip       VARCHAR(64),
    processed_at    TIMESTAMPTZ,
    error           VARCHAR(500),
    received_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_webhook_event UNIQUE (gateway, event_key)
);

-- ---------------------------------------------------------------------
-- 10. Notification log (WhatsApp / SMS)
-- ---------------------------------------------------------------------
CREATE TABLE notification_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ticket_id           UUID REFERENCES queue_tickets(id) ON DELETE SET NULL,
    channel             VARCHAR(20)  NOT NULL,
    template            VARCHAR(60)  NOT NULL,
    recipient           VARCHAR(20)  NOT NULL,
    status              VARCHAR(20)  NOT NULL,
    provider_message_id VARCHAR(150),
    error               VARCHAR(500),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_notif_channel CHECK (channel IN ('WHATSAPP', 'SMS', 'LOG')),
    CONSTRAINT ck_notif_status  CHECK (status IN ('SENT', 'FAILED', 'SKIPPED'))
);
CREATE INDEX idx_notif_tenant_created ON notification_log (tenant_id, created_at);

-- ---------------------------------------------------------------------
-- 11. Audit log
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(60)  NOT NULL,
    entity_type VARCHAR(60),
    entity_id   UUID,
    details     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_created ON audit_log (tenant_id, created_at);

-- ---------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated  BEFORE UPDATE ON tenants  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
