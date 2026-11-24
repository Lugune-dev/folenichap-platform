# Import the FoleniChap database into Neon — step by step

Files are in the `database/` folder:

| File | What it contains |
|---|---|
| `folenichap_full_database.sql` | **Everything in one file** (tables + Flyway baseline + demo data). Use this one. |
| `01_schema.sql` | Only the 11 tables, indexes, constraints and triggers |
| `03_flyway_baseline.sql` | Tells the backend that the schema is already installed |
| `02_seed_demo_data.sql` | Demo clinic, staff, services and 14 days of history (can be re-run) |

## Step 1 — Create the Neon project
1. Go to **https://console.neon.tech** and sign up (Google or GitHub login is fine).
2. Click **New Project**:
   * Project name: `folenichap`
   * Postgres version: **16**
   * Region: **AWS Europe Central 1 (Frankfurt)**, the closest to Tanzania
3. Click **Create**. Neon creates a database called `neondb` and a role such as `neondb_owner`.
4. (Optional) Rename the database: **Databases → New database** → name it `folenichap`, owner `neondb_owner`.
   If you do this, use `folenichap` instead of `neondb` in every step below.

## Step 2 — Import the SQL (choose A or B)

### A. Using the Neon SQL Editor (easiest, no installation)
1. In the left menu click **SQL Editor**.
2. At the top, choose your database (`neondb` or `folenichap`).
3. Open `database/folenichap_full_database.sql` in a text editor, select all (Ctrl+A), copy (Ctrl+C).
4. Paste it into the SQL Editor and click **Run**.
5. At the bottom you should see:
   ```
   tenants 1 | users 4 | services 3 | tickets (history) ~440 | payments ~190
   ```

### B. Using `psql` from your laptop (Ubuntu)
```bash
sudo apt install -y postgresql-client
cd ~/"folenichap "/folenichap-platform/database
# copy the connection string from Neon: Dashboard -> Connect -> "psql"
psql "postgresql://neondb_owner:YOUR_PASSWORD@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require" \
     -f folenichap_full_database.sql
```

## Step 3 — Check that it worked
Run this in the SQL Editor:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1;
SELECT email, role FROM users ORDER BY role;
```
You should see 12 tables (11 app tables + `flyway_schema_history`) and 4 users.

## Step 4 — Connect the backend to Neon
In Neon open **Dashboard → Connect**. You need two connection strings:
* **Pooled connection** ON (the host contains `-pooler`): this goes in `DB_URL`
* **Pooled connection** OFF (direct): this goes in `DB_MIGRATION_URL`

Convert `postgresql://USER:PASSWORD@HOST/DB?sslmode=require` into JDBC form and put it in
`folenichap-platform/.env` (copy it from `.env.example` first):

```env
DB_URL=jdbc:postgresql://ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
DB_MIGRATION_URL=jdbc:postgresql://ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
DB_USERNAME=neondb_owner
DB_PASSWORD=the-password-shown-by-neon
JWT_SECRET=<output of: openssl rand -base64 48>
PAYMENT_GATEWAY=MOCK
PUBLIC_BASE_URL=http://localhost:4200
CORS_ALLOWED_ORIGINS=http://localhost:4200
```
Note: the user and password go in `DB_USERNAME` and `DB_PASSWORD`, **not** inside the JDBC URL.

## Step 5 — Run the system
```bash
cd ~/"folenichap "/folenichap-platform
./scripts/run-local.sh
```
Open **http://localhost:4200** and log in:

| Who | Email | Password | Opens |
|---|---|---|---|
| Platform owner (you) | admin@folenichap.co.tz | Admin@2026 | /super |
| Clinic owner | owner@afyabora.co.tz | Demo@2026 | /admin |
| Doctor (Chumba 1) | asha@afyabora.co.tz | Demo@2026 | /desk |
| Lab (Maabara) | neema@afyabora.co.tz | Demo@2026 | /desk |

Customer booking page: http://localhost:4200/b/afya-bora · TV board: http://localhost:4200/tv/afya-bora

**Change these passwords** before showing the system to real clients (Admin → Staff → Reset password).

## Troubleshooting
| Message | Fix |
|---|---|
| `password authentication failed` | Wrong `DB_PASSWORD`; reset it in Neon → Roles |
| `SSL ... required` | Add `?sslmode=require` to the end of the URL |
| `Validate failed: Migrations have failed validation` | You imported the schema twice or edited it; drop all tables and re-import, or delete the `flyway_schema_history` row and restart |
| `Schema-validation: missing table` | The import did not finish; run `folenichap_full_database.sql` again on an empty database |
| Backend is slow on the first request | Neon "scales to zero" when idle; the first query wakes it (about 1 s). Turn off auto-suspend on a paid plan for production |

**Alternative:** you can skip Step 2 completely. If the database is empty, the backend creates all tables itself
(Flyway) on first start, and the super admin comes from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in `.env`.
Importing the SQL just gives you the demo clinic and history as well.
