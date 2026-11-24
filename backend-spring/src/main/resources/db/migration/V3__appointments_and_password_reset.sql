-- =====================================================================
-- V3: appointment slots (book for a time, not just "now") + password reset by OTP
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Services can be booked in advance
-- ---------------------------------------------------------------------
ALTER TABLE services
    ADD COLUMN allow_appointments BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN slot_capacity      INT     NOT NULL DEFAULT 1;
ALTER TABLE services
    ADD CONSTRAINT ck_services_slot_capacity CHECK (slot_capacity BETWEEN 1 AND 50);

-- tickets created when a booked customer checks in
ALTER TABLE queue_tickets DROP CONSTRAINT IF EXISTS ck_tickets_source;
ALTER TABLE queue_tickets ADD CONSTRAINT ck_tickets_source
    CHECK (source IN ('QR', 'WALK_IN', 'WHATSAPP', 'WEB', 'APPOINTMENT'));

-- ---------------------------------------------------------------------
-- 2. Appointments
-- ---------------------------------------------------------------------
CREATE TABLE appointments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES branches(id),
    service_id          UUID NOT NULL REFERENCES services(id),
    ticket_id           UUID REFERENCES queue_tickets(id) ON DELETE SET NULL,
    manage_token        VARCHAR(32)  NOT NULL,               -- unguessable public id
    customer_name       VARCHAR(120) NOT NULL,
    customer_phone      VARCHAR(20)  NOT NULL,
    customer_language   VARCHAR(5)   NOT NULL DEFAULT 'sw',
    appointment_date    DATE         NOT NULL,               -- local date in the tenant's timezone
    start_at            TIMESTAMPTZ  NOT NULL,
    end_at              TIMESTAMPTZ  NOT NULL,
    status              VARCHAR(20)  NOT NULL DEFAULT 'BOOKED',
    source              VARCHAR(20)  NOT NULL DEFAULT 'WEB',
    notes               VARCHAR(500),
    reminder_sent       BOOLEAN      NOT NULL DEFAULT FALSE,
    checked_in_at       TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version             BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_appointments_token UNIQUE (manage_token),
    CONSTRAINT ck_appointments_status CHECK (status IN ('BOOKED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW')),
    CONSTRAINT ck_appointments_source CHECK (source IN ('WEB', 'STAFF')),
    CONSTRAINT ck_appointments_lang   CHECK (customer_language IN ('sw', 'en')),
    CONSTRAINT ck_appointments_time   CHECK (end_at > start_at)
);
CREATE INDEX idx_appointments_slot ON appointments (branch_id, service_id, start_at)
    WHERE status IN ('BOOKED', 'CHECKED_IN');
CREATE INDEX idx_appointments_day ON appointments (tenant_id, branch_id, appointment_date, start_at);
CREATE INDEX idx_appointments_reminder ON appointments (start_at)
    WHERE status = 'BOOKED' AND NOT reminder_sent;
-- one live booking per phone per service and time
CREATE UNIQUE INDEX uq_appointments_phone_slot ON appointments (service_id, start_at, customer_phone)
    WHERE status IN ('BOOKED', 'CHECKED_IN');

CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Password reset codes (6-digit OTP sent by SMS / WhatsApp, stored as a bcrypt hash)
-- ---------------------------------------------------------------------
CREATE TABLE password_reset_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash   VARCHAR(100) NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    attempts    INT          NOT NULL DEFAULT 0,
    used_at     TIMESTAMPTZ,
    request_ip  VARCHAR(64),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_reset_user ON password_reset_codes (user_id, created_at);
