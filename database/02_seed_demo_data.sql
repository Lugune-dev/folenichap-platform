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
