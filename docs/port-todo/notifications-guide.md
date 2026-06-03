- Notifications:
### 3.9 Web Push (VAPID)

No console - VAPID keys are static. They're already in `wrangler.toml`
(`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CONTACT_EMAIL`).

If you rotate them, update **all subscribed browsers** will need to
re-subscribe (the public key is bound to the subscription).

### 3.10 Firebase Cloud Messaging (mobile push)

Console: <https://console.firebase.google.com>

- Service account JSON is **not yet set** as an env var. When you wire mobile
  push (Phase 4), upload the JSON via:
  ```powershell
  wrangler pages secret put FIREBASE_SERVICE_ACCOUNT_JSON --project-name warmchats
  ```
  (paste the JSON content when prompted).