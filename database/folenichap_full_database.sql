-- FoleniChap FULL DATABASE (schema + baseline + demo data) - paste into Neon SQL Editor
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

-- Tells Flyway that V1 (01_schema.sql) is already applied, so the backend starts
-- cleanly on a database you imported by hand. (The app also auto-baselines,
-- this just makes it explicit.)
CREATE TABLE IF NOT EXISTS flyway_schema_history (
    installed_rank INT NOT NULL PRIMARY KEY,
    version        VARCHAR(50),
    description    VARCHAR(200) NOT NULL,
    type           VARCHAR(20)  NOT NULL,
    script         VARCHAR(1000) NOT NULL,
    checksum       INT,
    installed_by   VARCHAR(100) NOT NULL,
    installed_on   TIMESTAMP    NOT NULL DEFAULT now(),
    execution_time INT          NOT NULL,
    success        BOOLEAN      NOT NULL
);
CREATE INDEX IF NOT EXISTS flyway_schema_history_s_idx ON flyway_schema_history (success);
INSERT INTO flyway_schema_history (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success)
SELECT 1, '1', '<< Flyway Baseline >>', 'BASELINE', '<< Flyway Baseline >>', NULL, current_user, 0, TRUE
WHERE NOT EXISTS (SELECT 1 FROM flyway_schema_history);

-- =====================================================================
-- FoleniChap - demo / starter data (run AFTER 01_schema.sql)
-- Creates: platform super admin, demo clinic "Kliniki Afya Bora",
--          branch, 3 services, 3 staff accounts, 14 days of history.
-- Passwords are hashed with bcrypt by pgcrypto (Spring Security compatible).
-- CHANGE THE PASSWORDS after first login.
-- Safe to re-run: it removes the previous demo tenant first.
-- =====================================================================
BEGIN;

-- remove previous demo data (cascades to branches, services, users, tickets)
DELETE FROM payments WHERE tenant_id IN (SELECT id FROM tenants WHERE slug = 'afya-bora');
DELETE FROM tenants  WHERE slug = 'afya-bora';

-- ---------------------------------------------------------------------
-- 1. Platform owner (SUPER_ADMIN)  -> login: admin@folenichap.co.tz / Admin@2026
-- ---------------------------------------------------------------------
INSERT INTO users (full_name, email, password_hash, role, preferred_language)
SELECT 'Platform Owner', 'admin@folenichap.co.tz', crypt('Admin@2026', gen_salt('bf', 10)), 'SUPER_ADMIN', 'en'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'SUPER_ADMIN');

-- ---------------------------------------------------------------------
-- 2. Demo tenant (Pro, active for 30 days)
-- ---------------------------------------------------------------------
INSERT INTO tenants (id, business_name, slug, phone, email, business_category, greeting_en, greeting_sw,
                     default_language, subscription_plan, subscription_status, trial_ends_at,
                     current_period_ends_at, sms_credits)
VALUES ('a0000000-0000-4000-8000-000000000001', 'Kliniki Afya Bora', 'afya-bora', '255712345678',
        'owner@afyabora.co.tz', 'CLINIC',
        'Welcome to Afya Bora Clinic! Choose a service to get your queue number.',
        'Karibu Kliniki Afya Bora! Chagua huduma upate namba yako ya foleni.',
        'sw', 'PRO', 'ACTIVE', now() - interval '1 day', now() + interval '30 days', 300);

INSERT INTO branches (id, tenant_id, name, address, phone, is_main, operating_hours)
VALUES ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        'Tawi Kuu - Mikocheni', 'Mikocheni B, Dar es Salaam', '255712345678', TRUE,
        '{"mon":{"open":"07:30","close":"20:00"},"tue":{"open":"07:30","close":"20:00"},
          "wed":{"open":"07:30","close":"20:00"},"thu":{"open":"07:30","close":"20:00"},
          "fri":{"open":"07:30","close":"20:00"},"sat":{"open":"08:00","close":"16:00"}}'::jsonb);

-- ---------------------------------------------------------------------
-- 3. Services
-- ---------------------------------------------------------------------
INSERT INTO services (id, tenant_id, name, name_sw, description, ticket_prefix, avg_duration_minutes,
                      fee_amount, require_upfront_payment, sort_order)
VALUES
 ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'General Consultation',
  'Ushauri wa Daktari', 'See a general practitioner', 'G', 12, 0, FALSE, 1),
 ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Dental Cleaning',
  'Kusafisha Meno', 'Scaling and polishing', 'D', 20, 15000, TRUE, 2),
 ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Laboratory Test',
  'Kipimo cha Maabara', 'Blood, malaria and urine tests', 'L', 8, 5000, FALSE, 3);

-- ---------------------------------------------------------------------
-- 4. Staff accounts (password for all three: Demo@2026)
--    owner@afyabora.co.tz  -> TENANT_ADMIN (admin portal + desk)
--    asha@afyabora.co.tz   -> STAFF, Chumba 1
--    neema@afyabora.co.tz  -> STAFF, Maabara
-- ---------------------------------------------------------------------
INSERT INTO users (id, tenant_id, branch_id, full_name, email, phone, password_hash, role, counter_label, preferred_language)
VALUES
 ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'Dkt. Juma Mwinyi', 'owner@afyabora.co.tz', '255712345678', crypt('Demo@2026', gen_salt('bf', 10)), 'TENANT_ADMIN', 'Mapokezi', 'sw'),
 ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'Dkt. Asha Salim', 'asha@afyabora.co.tz', '255754111222', crypt('Demo@2026', gen_salt('bf', 10)), 'STAFF', 'Chumba 1', 'sw'),
 ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'Neema Kileo', 'neema@afyabora.co.tz', '255765333444', crypt('Demo@2026', gen_salt('bf', 10)), 'STAFF', 'Maabara', 'sw');

-- ---------------------------------------------------------------------
-- 5. 14 days of realistic history (Mon-Sat, morning & afternoon peaks)
-- ---------------------------------------------------------------------
WITH days AS (
    SELECT (current_date - g)::date AS d
    FROM generate_series(1, 14) g
    WHERE extract(isodow FROM current_date - g) < 7          -- closed on Sunday
), plan AS (
    SELECT d, s.id AS service_id, s.ticket_prefix, s.avg_duration_minutes AS avg_min,
           CASE s.ticket_prefix WHEN 'G' THEN 22 WHEN 'D' THEN 6 ELSE 12 END
             * CASE WHEN extract(isodow FROM d) = 6 THEN 0.5 ELSE 1 END AS n
    FROM days CROSS JOIN services s
    WHERE s.tenant_id = 'a0000000-0000-4000-8000-000000000001'
), raw AS (
    SELECT p.d, p.service_id, p.ticket_prefix, p.avg_min, k AS seq,
           -- arrival: two peaks (~10:00 and ~15:30 EAT)
           ((p.d::timestamp + CASE WHEN random() < 0.6 THEN time '08:00' + random() * interval '4 hours'
                                    ELSE time '13:30' + random() * interval '4 hours' END)
             AT TIME ZONE 'Africa/Dar_es_Salaam') AS joined,
           random() AS r
    FROM plan p CROSS JOIN LATERAL generate_series(1, greatest(1, round(p.n * (0.8 + random() * 0.4))::int)) k
), ordered AS (
    SELECT *, row_number() OVER (PARTITION BY d, service_id ORDER BY joined) AS rn FROM raw
)
INSERT INTO queue_tickets (tenant_id, branch_id, service_id, served_by_user_id, ticket_number, sequence_no,
                           tracking_token, customer_name, customer_phone, source, status, payment_status,
                           counter_label, queue_date, joined_at, called_at, service_started_at, completed_at,
                           near_turn_notified)
SELECT 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', o.service_id,
       CASE WHEN o.r < 0.94 THEN CASE o.ticket_prefix WHEN 'L' THEN 'd0000000-0000-4000-8000-000000000003'::uuid
                                                       ELSE 'd0000000-0000-4000-8000-000000000002'::uuid END END,
       o.ticket_prefix || '-' || lpad(o.rn::text, 3, '0'), o.rn,
       encode(gen_random_bytes(12), 'hex'),
       (ARRAY['Juma Mussa','Rehema Ali','Baraka John','Fatuma Said','Emmanuel Paul','Zawadi Hassan','Grace Mwakyusa',
              'Hamisi Omary','Salma Kombo','Peter Mrema','Mwanaisha Juma','Daudi Kimaro','Upendo Mushi','Ali Bakari'])[1 + (o.rn % 14)],
       '2557' || lpad((10000000 + floor(random() * 89999999))::bigint::text, 8, '0'),
       CASE WHEN o.r < 0.15 THEN 'WALK_IN' ELSE 'QR' END,
       CASE WHEN o.r < 0.94 THEN 'COMPLETED' ELSE 'NO_SHOW' END,
       CASE WHEN o.ticket_prefix = 'G' THEN 'UNPAID' WHEN o.r < 0.94 THEN 'PAID' ELSE 'UNPAID' END,
       CASE WHEN o.r < 0.94 THEN CASE o.ticket_prefix WHEN 'L' THEN 'Maabara' ELSE 'Chumba 1' END END,
       o.d, o.joined,
       CASE WHEN o.r < 0.94 THEN o.joined + (5 + random() * 30) * interval '1 minute' END,
       CASE WHEN o.r < 0.94 THEN o.joined + (6 + random() * 30) * interval '1 minute' END,
       CASE WHEN o.r < 0.94 THEN o.joined + (6 + random() * 30 + o.avg_min * (0.7 + random() * 0.6)) * interval '1 minute' END,
       TRUE
FROM ordered o;

-- payments for paid history tickets (mix of networks)
INSERT INTO payments (tenant_id, ticket_id, payment_type, provider, gateway, msisdn, external_reference,
                      provider_transaction_id, amount, status, paid_at, created_at)
SELECT t.tenant_id, t.id, 'BOOKING_FEE',
       (ARRAY['MPESA','MPESA','TIGOPESA','AIRTEL','HALOPESA'])[1 + floor(random() * 5)::int],
       'AZAMPAY', t.customer_phone, 'BF-' || upper(encode(gen_random_bytes(6), 'hex')),
       'TXN' || upper(encode(gen_random_bytes(5), 'hex')), s.fee_amount, 'SUCCESS',
       t.joined_at + interval '1 minute', t.joined_at
FROM queue_tickets t JOIN services s ON s.id = t.service_id
WHERE t.tenant_id = 'a0000000-0000-4000-8000-000000000001' AND t.payment_status = 'PAID';

-- keep daily numbering consistent with the history
INSERT INTO ticket_sequences (branch_id, service_id, queue_date, last_number)
SELECT branch_id, service_id, queue_date, max(sequence_no)
FROM queue_tickets WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001'
GROUP BY branch_id, service_id, queue_date
ON CONFLICT (branch_id, service_id, queue_date) DO UPDATE SET last_number = EXCLUDED.last_number;

COMMIT;

-- quick check
SELECT 'tenants' AS item, count(*) FROM tenants
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'services', count(*) FROM services
UNION ALL SELECT 'tickets (history)', count(*) FROM queue_tickets
UNION ALL SELECT 'payments', count(*) FROM payments;
