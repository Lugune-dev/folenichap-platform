# FoleniChap SaaS

Multi-tenant queue management, appointment booking and mobile-money collection for East African businesses
(clinics, salons, car washes, bursar offices). Customers scan a QR code, choose a service, optionally pay by
**M-Pesa / Mixx by Yas / Airtel Money / HaloPesa** STK push, and watch their place in the queue live. Alerts go out on
WhatsApp with SMS as the fallback. The UI is bilingual (Kiswahili / English).

| Layer     | Stack |
|-----------|-------|
| Backend   | Java 21, Spring Boot 3.4, Spring Security (JWT + rotating refresh tokens), JPA/Hibernate 6, Flyway, SSE, virtual threads |
| Frontend  | Angular 18 (standalone components, signals, new control flow), Tailwind CSS |
| Database  | **Online PostgreSQL 16** (Neon, Supabase, Aiven, RDS...), SSL required |
| Infra     | Docker Compose on a Hostinger KVM VPS, Nginx + Let's Encrypt, optional Redis |

---

## 1. Architecture

```
 Customer phone ──QR──►  /b/{slug}  ──POST ticket──►  Spring Boot  ──►  Online PostgreSQL (SSL)
 TV in waiting room ◄──── SSE /stream ◄──────────────┤   (modular monolith)
 Reception desk ──JWT──► /api/v1/queue/* ────────────┤──► AzamPay (USSD/STK push) ──webhook──┐
 Business admin ──JWT──► /api/v1/admin/*             │──► WhatsApp Cloud API → Beem SMS     │
 Platform owner ──JWT──► /api/v1/super/*             ◄───────────────────────────────────────┘
```

### Design choices

**Multi-tenancy (shared schema).** Every business table has a mandatory `tenant_id`. Isolation is enforced in two layers:
1. Every repository lookup takes `tenantId` explicitly (`findByIdAndTenantId`, etc.), using the tenant id from the verified JWT.
2. As a second guard, a Hibernate `@Filter` (`tenant_id = :tenantId`) is switched on automatically for every transaction
   by `TenantAwareTransactionManager`.

**Race-free queue numbering.** `D-001`, `D-002`… come from one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`
on `ticket_sequences` (per branch, service and day). The numbers have no gaps and no duplicates, even when many
customers book at the same moment.

**"Call Next" with several agents.** `SELECT … FOR UPDATE OF t SKIP LOCKED` means two agents pressing *Call Next*
at the same moment always get different customers. If a service requires upfront payment, its tickets are skipped
until they are PAID or WAIVED.

**Events only after commit.** Every state change publishes a `QueueChangedEvent`. A
`@TransactionalEventListener(AFTER_COMMIT)` + `@Async` listener then rebuilds the board, pushes it over SSE and sends
notifications, so a rolled-back change is never broadcast and agents' clicks return straight away. Set
`FOLENI_SSE_REDIS_RELAY=true` to fan board updates out across several backend instances through Redis pub/sub.

**Payments are never held inside a DB transaction.** The flow is: record PENDING and commit → call the gateway →
record the result. Settlement is idempotent: a `webhook_events` unique key plus a pessimistic lock on the payment row,
and the amount is checked against the expected fee. STK pushes the customer never answers expire after 10 minutes.

**Notifications.** WhatsApp is tried first and Beem SMS is the automatic fallback. Each message takes one credit
through an atomic decrement, and the credit is refunded if every channel fails. The "2 spots away" alert is claimed
atomically, so it is sent only once per ticket.

**Optimistic locking** on tickets (`@Version`) plus `@DynamicUpdate` prevents lost updates between concurrent agents.

### Plans (enforced server-side)

| | Starter (TZS 35,000) | Pro (TZS 75,000) |
|---|---|---|
| Branches | 1 | 3 |
| Counters / agents | 3 | unlimited |
| WhatsApp/SMS alerts | – | ✓ (300 credits / month) |
| Mobile money fee collection | – | ✓ |

During the 14-day trial, tenants get Pro features, so they can try alerts and payments before you convert them.

---

## 2. Set up the ONLINE PostgreSQL database

> **Step-by-step Neon import with demo data: see [NEON_IMPORT_GUIDE.md](NEON_IMPORT_GUIDE.md)** and the `database/` folder.

You need a managed PostgreSQL 16 database. Pick one provider:

### Option A — Neon (serverless Postgres, generous free tier)
1. Sign up at https://neon.tech → **New project** → Postgres **16**, region **AWS eu-central-1 (Frankfurt)**
   (the lowest latency to Dar es Salaam among the common regions).
2. Create a database named `folenichap`.
3. Open **Connection details** and copy two connection strings:
   * **Pooled** (host contains `-pooler`) → `DB_URL`
   * **Direct** (no `-pooler`) → `DB_MIGRATION_URL` (Flyway needs a session connection, not PgBouncer)
4. Convert them to JDBC format:
   ```
   DB_URL=jdbc:postgresql://ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/folenichap?sslmode=require
   DB_MIGRATION_URL=jdbc:postgresql://ep-cool-name-123456.eu-central-1.aws.neon.tech/folenichap?sslmode=require
   DB_USERNAME=<role from Neon>
   DB_PASSWORD=<password from Neon>
   ```

### Option B — Supabase
1. https://supabase.com → **New project** (region: Frankfurt or closest to you).
2. **Project Settings → Database → Connection string → Session pooler** (port **5432**).
3. ```
   DB_URL=jdbc:postgresql://aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require
   DB_USERNAME=postgres.<project-ref>
   DB_PASSWORD=<db password>
   ```
   Leave `DB_MIGRATION_URL` empty; the session pooler works for Flyway. Do **not** use the transaction pooler (port 6543)
   for Flyway.

### Option C — Any other managed Postgres (Aiven, DigitalOcean, RDS, Render…)
Use `jdbc:postgresql://HOST:PORT/DB?sslmode=require` and set the username and password.

**You never create tables by hand.** When the backend starts, Flyway runs
`backend-spring/src/main/resources/db/migration/V1__init_schema.sql` against the online database. Hibernate then
checks (`ddl-auto: validate`) that the entities match the schema exactly.

The pool settings in `application.yml` are tuned for serverless databases: `keepalive-time` stops Neon from
dropping idle connections, and the default pool size of 8 fits free-tier connection limits.

---

## 3. Run locally

Prerequisites: JDK 21, Maven 3.9+, Node 22.

```bash
cp .env.example .env              # fill DB_* with your ONLINE database + JWT_SECRET
./scripts/run-local.sh            # builds + starts backend and frontend (Linux/macOS)

# or manually:
set -a; source .env; set +a

# backend  -> http://localhost:8080  (Swagger: /swagger-ui.html)
cd backend-spring && mvn spring-boot:run

# frontend -> http://localhost:4200  (proxies /api to :8080)
cd frontend-angular && npm install && npm start
```

Log in with `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` (this account is created on the first start), or register a
business at `/register`.

With `PAYMENT_GATEWAY=MOCK`, every STK push is "paid" automatically after 6 seconds, so you can test the whole flow
with no real money. Fees ending in **13** (e.g. TZS 1,013) simulate a failed payment.

*Offline only:* `docker compose -f docker-compose.local.yml up -d` starts a local Postgres, then run the backend
with `SPRING_PROFILES_ACTIVE=local`.

### Try the full journey
1. Register a business → **Admin → Services**: add "Dental" with prefix `D`, a fee of 5000 and *upfront payment* ticked.
2. **Admin → Settings**: print the QR stand, then open the booking link on your phone.
3. Open `/tv/{slug}` on a second screen and click once to enable sound.
4. Book a ticket → the tracker shows your position live → the mock payment marks it PAID.
5. Go to `/desk` → press **N** (Call Next): the TV chimes and announces the number in Swahili and English, and the
   customer's tracker turns green and vibrates.

---

## 4. Production deployment (Hostinger KVM 2 VPS)

```bash
# on the VPS (Ubuntu 24.04)
curl -fsSL https://get.docker.com | sh
git clone <your-repo> folenichap && cd folenichap
cp .env.example .env && nano .env          # online DB, JWT_SECRET, DOMAIN, gateway keys...
# point your DNS A records (@ and www) to the VPS IP, then:
./scripts/init-letsencrypt.sh              # first time only: issues the TLS certificate
docker compose up -d --build
```

Later deploys: `./scripts/deploy.sh`. Certificates renew automatically through the `certbot` service.

Nginx is configured for SSE (`proxy_buffering off`, 1-hour read timeout), rate-limits the public API, sets security
headers, and serves the SPA with long-cache hashed assets.

The database lives with your online provider, so the VPS holds no state. Turn on your provider's point-in-time
recovery or backups (Neon and Supabase both offer this).

---

## 5. Integrations

### AzamPay (mobile money for all Tanzanian networks)
1. Register at https://developers.azampay.co.tz → create an app → copy the *App name*, *Client ID*, *Client secret* and *API key*.
2. Set the callback URL in the merchant portal to
   `https://<DOMAIN>/api/v1/webhooks/payments/azampay?token=<PAYMENT_WEBHOOK_SECRET>`
3. In `.env`: `PAYMENT_GATEWAY=AZAMPAY` plus the `AZAMPAY_*` values. Use the sandbox URLs until you go live.
4. Optional hardening: set `PAYMENT_WEBHOOK_ALLOWED_IPS` to AzamPay's callback IPs.

The webhook accepts either an HMAC-SHA256 signature header (hex, base64 or `sha256=` prefix) **or** the secret URL
token. Duplicate callbacks are ignored, and amounts are checked against the expected fee.

> Before going live, check the field names (`utilityref`, `transactionstatus`, `provider` codes) against AzamPay's
> current API documentation. They are mapped in `AzamPayGateway` and `PaymentService.handleWebhook`.

To add ClickPesa or Selcom, implement `PaymentGateway` (one class) and annotate it with
`@ConditionalOnProperty(name="foleni.payment.gateway", havingValue="CLICKPESA")`.

### WhatsApp Cloud API
Create these **Utility** templates in Meta Business Manager, in both `sw` and `en`. Parameters must be in this order:

| Template | Body (Swahili example) |
|---|---|
| `foleni_ticket_booked` | Habari {{1}}, namba yako ya foleni {{3}} ni {{2}}. Watu {{4}} wako mbele yako (takriban dakika {{5}}). Fuatilia: {{6}} |
| `foleni_near_turn` | Habari {{1}}, zamu yako ({{2}}) {{3}} inakaribia - wamebaki watu {{4}} tu mbele yako. Tafadhali fika mapokezi. |
| `foleni_called` | {{1}}, namba {{2}}: tafadhali nenda {{3}} sasa. - {{4}} |

Then set `WHATSAPP_ENABLED=true`, `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` (use a permanent System User token).

### Beem Africa SMS (fallback)
Register a sender ID at https://beem.africa, then set `SMS_ENABLED=true`, `BEEM_API_KEY`, `BEEM_SECRET_KEY` and `BEEM_SENDER_ID`.

If neither channel is configured, messages are written to the log instead (status `SKIPPED` in `notification_log`).

Appointment confirmations, reminders and password reset codes go by SMS until you set
`WHATSAPP_TEMPLATE_APPT_BOOKED`, `WHATSAPP_TEMPLATE_APPT_REMINDER` and `WHATSAPP_TEMPLATE_PASSWORD_RESET` to approved
template names (parameters in the order listed in `MessageTemplates.java`; the reset code needs an
*authentication* template).

---

## 6. API reference (summary — full OpenAPI at `/swagger-ui.html`)

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | Tenant + admin user, 14-day trial |
| POST | `/api/v1/auth/login` · `/refresh` · `/logout` | Public | JWT (30 min) + rotating refresh token (14 days, reuse detection) |
| POST | `/api/v1/auth/password/forgot` | Public | Sends a 6-digit code to the account's phone (always 202; max 3 codes/hour, 1/minute) |
| POST | `/api/v1/auth/password/reset` | Public | Code + new password; 5 guesses per code, 15-minute expiry; signs out all devices |
| GET | `/api/v1/public/tenants/{slug}` | Public | Profile, branches, active services, waiting counts, ETAs |
| POST | `/api/v1/public/tenants/{slug}/tickets` | Public | Issue ticket; STK push if a fee applies (rate-limited per IP and phone) |
| GET | `/api/v1/public/tenants/{slug}/stream` | Public SSE | Live board for the TV, tracker and desk |
| GET | `/api/v1/public/tickets/{token}` | Public | Tracker: position, ETA, payment status |
| POST | `/api/v1/public/tickets/{token}/pay` · `/cancel` | Public | Retry payment / cancel |
| GET | `/api/v1/public/tenants/{slug}/slots?serviceId&date&branchId` | Public | Free/taken appointment slots for a day |
| POST | `/api/v1/public/tenants/{slug}/appointments` | Public | Book a slot (advisory lock, never overbooks); confirmation by WhatsApp/SMS |
| GET/POST | `/api/v1/public/appointments/{token}` · `/check-in` · `/cancel` | Public | Manage a booking; check-in issues the queue ticket |
| POST | `/api/v1/webhooks/payments/{gateway}` | Gateway | Signature/token-verified, idempotent settlement |
| GET | `/api/v1/queue/today` | Staff+ | Tickets grouped by status |
| POST | `/api/v1/queue/call-next` | Staff+ | Atomic call (SKIP LOCKED), optional service filter |
| PATCH | `/api/v1/queue/tickets/{id}/call` · `recall` · `start` · `complete` · `no-show` · `requeue` | Staff+ | State machine |
| PATCH | `/api/v1/queue/tickets/{id}/payment` | Staff+ | `PAID_CASH` or `WAIVED` (audited) |
| POST | `/api/v1/queue/walk-in` | Staff+ | Walk-in ticket (phone optional) |
| GET/POST | `/api/v1/queue/appointments?date` · `/slots` | Staff+ | Day's bookings; book on a customer's behalf |
| PATCH | `/api/v1/queue/appointments/{id}/check-in` · `cancel` · `no-show` | Staff+ | Reception actions on bookings |
| CRUD | `/api/v1/admin/services` · `/staff` · `/branches` · `/profile` | Tenant admin | Configuration, with plan limits enforced |
| GET | `/api/v1/admin/analytics/dashboard?from&to` | Tenant admin | KPIs, daily series, peak-hour heatmap, staff and service performance |
| GET | `/api/v1/admin/payments` | Tenant admin | Payment ledger |
| POST | `/api/v1/admin/subscription/pay` | Tenant admin | Pay the SaaS plan by mobile money (adds 30 days) |
| GET/PATCH/POST | `/api/v1/super/tenants…` · `/super/metrics` | Super admin | Approve/suspend/upgrade, extend trial, credits, MRR, gateway health |

Errors are returned as RFC 7807 `ProblemDetail` with a stable `code` field (e.g. `INVALID_PHONE`, `PLAN_LIMIT`,
`PAYMENT_REQUIRED`), which the frontend translates into Swahili or English.

### Ticket state machine
```
WAITING ──call──► CALLED ──start──► SERVING ──complete──► COMPLETED
   │  ▲              │ ▲ recall
   │  └──requeue─────┤ └──┘
   │                 └──no-show──► NO_SHOW ──requeue──► WAITING
   └──customer cancel──► CANCELLED
```
At 00:15 EAT each night, a job closes yesterday's unfinished tickets so reports stay accurate.

### Appointments
Turn on **"Customers can book a time in advance"** for a service (Admin → Services). Slots are as long as the
service's average duration, inside the branch opening hours (08:00–17:00 when none are set), up to 30 days ahead,
and at least 15 minutes from now. **Bookings per slot** sets how many customers may share one time.

```
BOOKED ──check-in (1 h before → 30 min after start)──► CHECKED_IN  (queue ticket issued, source APPOINTMENT)
   ├──customer/staff cancel──► CANCELLED
   └──no-show (staff, or automatically 30 min after the slot ends)──► NO_SHOW ──staff check-in (same day)──► CHECKED_IN
```
A customer who checks in on time keeps the queue position of their slot start, so walk-ins who arrived later do
not overtake them. Confirmation goes out when booked and a reminder about 1 hour before (uses message credits).
Any fee is paid at check-in through the normal ticket flow.

### Password reset
"Forgot password?" on the login page sends a 6-digit code by WhatsApp/SMS to the phone on the user's account
(for a business owner without one, the business phone). Reset codes are paid by the platform, not the tenant's
message credits. Staff without a phone number still ask their admin to reset the password.

---

## 7. Frontend routes

| Route | Who | What |
|---|---|---|
| `/b/{slug}` | Customer | Mobile booking page: join the queue now, or book a time (remembers name and phone) |
| `/a/{token}` | Customer | Booked appointment: details, "I'm here" check-in, cancel |
| `/forgot-password` | Staff/owner | Reset password with a code sent by SMS/WhatsApp |
| `/t/{token}` | Customer | Live tracker: SSE + polling fallback, vibration and notification when called, retry payment |
| `/tv/{slug}?branch=&lang=` | Waiting room | Full-screen board, WebAudio chime, spoken SW/EN announcement, QR to join, screen wake-lock |
| `/desk` | Reception/agent | Call next, recall, start, complete, no-show, walk-in, cash/waive; keyboard shortcuts **N R S C** |
| `/admin/*` | Business owner | Dashboard, appointments, services, staff, branches and hours, payments, settings (printable QR stand), subscription |
| `/super` | Platform owner | Tenants lifecycle, MRR, credits, gateway health |

---

## 8. Project layout

```
folenichap-platform/
├── backend-spring/
│   ├── src/main/java/tz/co/folenichap/
│   │   ├── config/        AppProperties, TenantAwareTransactionManager, OpenAPI, HTTP client
│   │   ├── security/      JwtService, JwtAuthFilter, TenantContext, SecurityConfig
│   │   ├── common/        TenantScopedEntity, ApiException/handler, PhoneNumbers, AuditService
│   │   ├── auth/          register / login / refresh / logout
│   │   ├── tenant/        Tenant, Branch, plans, TenantGuard, admin + super-admin APIs, subscription jobs
│   │   ├── user/          AppUser, refresh tokens, staff admin, super-admin bootstrap
│   │   ├── queue/         services, tickets, sequences, public booking, staff desk, live/ (SSE, board, Redis relay)
│   │   ├── payment/       PaymentService, AzamPay + Mock gateways, webhook security
│   │   ├── notification/  WhatsApp Cloud + Beem SMS clients, bilingual templates
│   │   └── analytics/     SQL-based KPIs
│   └── src/main/resources/db/migration/V1__init_schema.sql
├── frontend-angular/src/app/{core,shared,features/*}
├── nginx/default.conf
├── docker-compose.yml  · docker-compose.local.yml · .env.example
├── scripts/            init-letsencrypt.sh, deploy.sh
└── .github/workflows/ci.yml
```

---

## 9. What has been verified

* `V1__init_schema.sql` was applied to a real **PostgreSQL 16** server, and every hand-written SQL statement was run
  against seeded data: the sequence upsert, call-next with `SKIP LOCKED` (it correctly skips an unpaid upfront ticket),
  all analytics and super-admin queries, webhook idempotency, credit debit, and day-close.
* All Java sources pass a `javac` syntax check. All TypeScript passes a syntax check, plus a type check against
  Angular/RxJS API stubs.
* **Not yet run:** a full `mvn verify` and `ng build`. The build sandbox had no access to the Maven or npm
  registries. Run them once on your machine; the CI workflow in `.github/workflows/ci.yml` does both, plus a boot
  smoke test that applies Flyway and runs Hibernate schema validation.

## 10. Roadmap ideas
ClickPesa/Selcom adapters · PWA with push notifications ·
per-tenant custom domains · USSD booking for feature phones · daily WhatsApp summary to the owner.
