# Android app (APK / Play Store) for FoleniChap

The Android app is a **Trusted Web Activity (TWA)**: a small, signed Android package that opens the
live site full-screen with no browser address bar. Every website update reaches the app instantly,
with no new APK needed. The site already passes PWABuilder with 0 errors.

## Before you start: decide the domain

The app is tied to one web address. Building it for `frontend-angular-sooty.vercel.app` and later
moving to `folenichap.co.tz` means building and publishing a new app. If you will buy a domain,
connect it to Vercel first (Vercel -> Settings -> Domains).

## 1. Generate the app (PWABuilder, nothing to install)

1. Open <https://www.pwabuilder.com>, enter your site URL, then **Package for stores -> Android -> Generate**.
2. Options:
   - **Package ID:** `tz.co.folenichap.app` (already used in `frontend-angular/src/.well-known/assetlinks.json`)
   - **App name:** `FoleniChap`, **Short name:** `FoleniChap`
   - **Signing key:** *Create new*. Fill in your organisation details.
3. Download the zip. It contains:
   - `*.apk`: install directly on phones (share by WhatsApp or link).
   - `*.aab`: upload to Google Play.
   - `signing.keystore` + `signing-key-info.txt`: **back these up somewhere safe and private**
     (password manager or encrypted drive). Lose them and you can never update the app. Never commit them to GitHub.
   - `assetlinks.json`: contains your key's **SHA-256 fingerprint**.

## 2. Link the app to the site (removes the address bar)

Copy the fingerprint from the downloaded `assetlinks.json` (it looks like `AB:CD:12:...`, 32 pairs) into
`frontend-angular/src/.well-known/assetlinks.json`, replacing `REPLACE_WITH_SHA256_FINGERPRINT_FROM_PWABUILDER`.
The fingerprint is public information (it identifies, not unlocks, your key). Push, and once Vercel has deployed, check:

```bash
curl https://<your-site>/.well-known/assetlinks.json
```

If you later publish on Google Play with **Play App Signing**, also add the fingerprint shown in
Play Console -> Setup -> App signing (keep both in the list).

## 3. Install / publish

- **Direct install:** send the `.apk`, then on the phone allow "Install unknown apps" for the app you open it with.
- **Google Play:** one-time USD 25 developer account -> create app -> upload the `.aab` -> fill store listing,
  privacy policy URL and data-safety form -> submit for review.
