# AzamPay: from sandbox to real money

FoleniChap collects mobile money through **AzamPay**, one API for M-Pesa, Mixx by Yas (Tigo Pesa),
Airtel Money, HaloPesa and AzamPesa. The customer gets a USSD prompt on their phone, enters their PIN,
and AzamPay calls our webhook to confirm.

Until you have credentials the app runs on the **MOCK** gateway (payments are simulated and auto-approved).
MOCK only starts when `ALLOW_MOCK_PAYMENTS=true`, so it can never reach production by accident.

## 1. Get sandbox credentials

1. Sign up at <https://developers.azampay.co.tz> and create an app.
2. From the app page copy **App Name**, **Client ID**, **Client Secret**, and the **API Key** (token).
3. In the app settings, set the **callback URL** to:

   ```
   https://<your-domain>/api/v1/webhooks/payments/azampay?token=<PAYMENT_WEBHOOK_SECRET>
   ```

   `PAYMENT_WEBHOOK_SECRET` is already generated in your `.env` (48 random hex characters).
   For local testing expose your machine with a tunnel (for example `cloudflared tunnel --url http://localhost:8080`)
   and use that https URL as the domain.

## 2. Switch the app to AzamPay sandbox

Put your values in `.env` yourself (never paste keys in chat or commit them):

```properties
PAYMENT_GATEWAY=AZAMPAY
ALLOW_MOCK_PAYMENTS=false
AZAMPAY_APP_NAME=...
AZAMPAY_CLIENT_ID=...
AZAMPAY_CLIENT_SECRET=...
AZAMPAY_API_KEY=...        # optional
AZAMPAY_AUTH_URL=https://authenticator-sandbox.azampay.co.tz
AZAMPAY_CHECKOUT_URL=https://sandbox.azampay.co.tz
```

Restart the backend. It logs `AzamPay SANDBOX is active` and refuses to start if a key is missing or the
webhook secret is weak.

## 2b. On Render (+ Vercel)

Set these in Render -> `folenichap-api` -> **Environment** (names must match exactly, e.g. `AZAMPAY_AUTH_URL`, not `ZAMPAY_AUTH_URL`):

| Key | Sandbox value | Live value |
|---|---|---|
| `PAYMENT_GATEWAY` | `AZAMPAY` | `AZAMPAY` |
| `ALLOW_MOCK_PAYMENTS` | `false` | `false` |
| `AZAMPAY_APP_NAME` | app name from the portal | same |
| `AZAMPAY_CLIENT_ID` / `AZAMPAY_CLIENT_SECRET` | sandbox app keys | production keys |
| `AZAMPAY_API_KEY` | optional (sent as `X-API-Key` when set) | optional |
| `AZAMPAY_AUTH_URL` | `https://authenticator-sandbox.azampay.co.tz` | `https://authenticator.azampay.co.tz` |
| `AZAMPAY_CHECKOUT_URL` | `https://sandbox.azampay.co.tz` | `https://checkout.azampay.co.tz` |
| `PAYMENT_WEBHOOK_SECRET` | `openssl rand -hex 24` | rotate when going live |

Callback URL for the AzamPay portal (it goes through the Vercel proxy):

```
https://<app>.vercel.app/api/v1/webhooks/payments/azampay?token=<PAYMENT_WEBHOOK_SECRET>
```

On start the log shows `AzamPay SANDBOX|PRODUCTION: auth=... checkout=... app=...`. If AzamPay rejects a
request, the log shows its HTTP status and message (`AzamPay token request rejected: ...` or
`AzamPay checkout ... rejected: ...`).

## 3. Go live

1. Complete AzamPay merchant KYC (business registration, TIN, bank account) to get **production** credentials.
2. Replace the four keys and switch the URLs:

   ```properties
   AZAMPAY_AUTH_URL=https://authenticator.azampay.co.tz
   AZAMPAY_CHECKOUT_URL=https://checkout.azampay.co.tz
   ```

3. Ask AzamPay for the IP addresses their callbacks come from and set them:

   ```properties
   PAYMENT_WEBHOOK_ALLOWED_IPS=x.x.x.x,y.y.y.y
   ```

4. Rotate the webhook secret (`openssl rand -hex 24`) and update the callback URL in the AzamPay portal.

## How payments are protected

| Threat | Protection |
|---|---|
| Forged "payment successful" callback | Secret token (or HMAC signature) required, optional IP allow-list, constant-time comparison |
| Paying 100 TZS for a 15,000 TZS service | Callback amount must equal the stored amount exactly, otherwise the payment is marked FAILED |
| Success callback with no amount | Never settled; left pending for review |
| Replayed callback | Each callback is stored once per reference + status; duplicates are ignored |
| Customer approves just after the 10-minute timeout | The authenticated success callback revives the timed-out payment, so nobody pays without being credited |
| Being served without paying | "Call next" skips unpaid tickets for upfront-payment services; "Start" refuses them (HTTP 402) |
| USSD-prompt spam to someone's phone | Max 3 pushes per ticket and per phone number per minute |
| Callback flooding | Max 120 callbacks per minute per source IP |
| Fake payments in production | MOCK gateway refuses to start unless `ALLOW_MOCK_PAYMENTS=true` |
| Slow gateway hanging the server | 5 s connect / 25 s read timeouts on every AzamPay call |
