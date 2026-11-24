# Free deployment: Vercel (app) + Render (API) + Neon (database)

```
Browser ──> https://<app>.vercel.app ──┬── static Angular app + PWA (Vercel CDN)
                                       └── /api/*  ──(middleware.js adds X-Proxy-Secret + X-Client-IP)──> Render (Spring Boot) ──> Neon
```

The browser only ever talks to the Vercel address. That keeps the login cookie (`HttpOnly; SameSite=Strict`)
working, and the shared secret stops anyone from calling the Render URL directly.

## 1. Neon (database)

1. In <https://console.neon.tech> create a project in **AWS Europe Central 1 (Frankfurt)**, next to Render.
2. From **Connection details** copy the host, user and password. You need two URLs:
   - pooled (host contains `-pooler`): `jdbc:postgresql://ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`
   - direct (same host without `-pooler`): used by Flyway migrations.

Tables are created automatically by Flyway on the first start.

## 2. Make two secrets (on your computer)

```bash
openssl rand -hex 24   # PROXY_SHARED_SECRET  (same value on Render AND Vercel)
openssl rand -hex 24   # PAYMENT_WEBHOOK_SECRET (Render only)
```

## 3. Render (API)

1. <https://dashboard.render.com> -> **New** -> **Blueprint** -> connect GitHub -> pick `folenichap-platform`.
   Render reads `render.yaml` and creates `folenichap-api` (free, Frankfurt, Docker).
2. Fill in the values it asks for:

| Key | Value |
|---|---|
| `DB_URL` | pooled Neon JDBC URL |
| `DB_MIGRATION_URL` | direct Neon JDBC URL |
| `DB_USERNAME` / `DB_PASSWORD` | from Neon |
| `PUBLIC_BASE_URL` | `https://<app>.vercel.app` (fill after step 4, then redeploy) |
| `CORS_ALLOWED_ORIGINS` | same as `PUBLIC_BASE_URL` |
| `PROXY_SHARED_SECRET` | secret from step 2 |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | your platform-owner login (strong password) |
| `PAYMENT_WEBHOOK_SECRET` | secret from step 2 |

3. Wait for the first deploy (the Docker build takes a few minutes). Check
   `https://folenichap-api.onrender.com/actuator/health` shows `{"status":"UP"}`.
   Any other URL on that address answers **403**: that is expected, only Vercel may call it.

## 4. Vercel (app)

1. <https://vercel.com/new> -> import `folenichap-platform` from GitHub.
2. **Root Directory:** `frontend-angular` (framework, build command and output are read from `vercel.json`).
3. **Environment Variables:**

| Key | Value |
|---|---|
| `BACKEND_URL` | `https://folenichap-api.onrender.com` (no trailing slash) |
| `PROXY_SHARED_SECRET` | the same secret as on Render |

4. Deploy. Then put the Vercel address into `PUBLIC_BASE_URL` / `CORS_ALLOWED_ORIGINS` on Render and redeploy it.

## 5. Keep the API awake (recommended)

Render's free plan sleeps after 15 minutes without traffic, and a sleeping Java app takes about a minute
to wake. Meanwhile the app shows "The server is waking up". To avoid that, create a free monitor at
<https://uptimerobot.com> or <https://cron-job.org> that opens
`https://folenichap-api.onrender.com/actuator/health` every 10 minutes.
One always-on service fits in Render's 750 free hours a month.

## Limits of the free setup

- Payments run on the **MOCK** gateway (simulated). Before taking real money follow `AZAMPAY_SETUP.md`,
  set `PAYMENT_GATEWAY=AZAMPAY`, `ALLOW_MOCK_PAYMENTS=false`, and use
  `https://<app>.vercel.app/api/v1/webhooks/payments/azampay?token=<PAYMENT_WEBHOOK_SECRET>` as the callback.
- Live TV / queue updates reconnect every few minutes (Vercel limits how long one response can stay open).
  The app reconnects by itself.
- 512 MB RAM and a shared CPU: fine for a pilot, not for many busy branches. Move to a VPS
  (`docker-compose.yml`, `nginx/`) when you have paying customers; leave `PROXY_SHARED_SECRET` empty there.
