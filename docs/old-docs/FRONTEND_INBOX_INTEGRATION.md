# Frontend Integration Guide - Inbox Features

This guide tells the frontend how to consume each backend feature shipped
under the inbox initiative. Every section maps 1:1 to a row in
`inbox_implement_prompt.md` and is written in the same order they were
implemented in the backend.

All endpoints require a `Bearer` JWT in the `Authorization` header unless
explicitly noted as public.

---

## Section 1 - User notification preferences

Lets the user opt in/out of inbound-message notifications per channel and
per delivery method (web push, mobile push, email digest).

**Backend commit:** Section 1 on `thesarwars_v2`.

### Endpoints

#### `GET /api/me/notification-settings`

Read the signed-in user's current flags.

**Response 200**
```json
{
  "notify_sms_inbound":     true,
  "notify_email_inbound":   true,
  "notify_via_web_push":    true,
  "notify_via_mobile_push": true,
  "notify_via_email_digest": false
}
```

#### `PATCH /api/me/notification-settings`

Partial update - only send the keys you're changing.

**Request body**
```json
{ "notify_sms_inbound": false, "notify_via_web_push": true }
```

**Response 200** - full updated object (same shape as GET).

**Errors**
- `400 { "error": "Unknown notification setting(s)", "unknown_fields": ["foo"], "supported_fields": [...] }` - unknown key in body.
- `400 { "error": "Field 'X' must be a boolean" }` - non-boolean value.
- `404 { "error": "User not found" }`.

### What the frontend needs to do

1. **Settings page UI** - render five toggles (one per flag). Hydrate from `GET` on mount.
2. **On toggle change** - debounce ~300 ms then PATCH the single changed flag.
3. **Optimistic UI** - flip the toggle immediately, revert on PATCH failure, surface the error.
4. **Show a hint when both pushes are off** - "You won't receive notifications outside the open tab. Enable web push or mobile push to be notified when WarmChats isn't open."
5. **Empty state for unconfigured users** - first-time visitors will see all-true defaults from the backend; no special handling needed.

### References

- Swagger: `/api/me/notification-settings` under the **Notifications** tag in `swagger.yaml`.
- Backend route: the notification-settings endpoint.
- DB columns: on the user record - `notify_sms_inbound`, `notify_email_inbound`, `notify_via_web_push`, `notify_via_mobile_push`, `notify_via_email_digest`.

---

## Section 2 - Notification center + history

In-app history for the bell-icon dropdown. Powers the unread badge and the
"Notification Center" tray. Each notification carries a deep-link payload
(`channel` + `contact_id` + `conversation_id`) so clicking it can route the
user straight into the relevant SMS or email thread.

**Backend commit:** Section 2 on `thesarwars_v2`.

### Endpoints

#### `GET /api/notifications`

List notifications, newest first, with cursor pagination.

| Query | Type | Default | Notes |
|---|---|---|---|
| `unread_only` | boolean | `false` | When true, return only `is_read = false` rows. |
| `limit` | int 1-100 | `25` | Page size. |
| `cursor` | string | - | Pass the previous response's `next_cursor` to fetch the next page. |

**Response 200**
```json
{
  "items": [
    {
      "id": 482,
      "kind": "sms_inbound",
      "channel": "sms",
      "contact_id": 17,
      "conversation_id": 31,
      "title": "Lisa Park",
      "body": "Hey, can we move tomorrow's showing to 4 PM?",
      "is_read": false,
      "read_at": null,
      "created_at": "2026-05-05T14:31:08Z"
    }
  ],
  "next_cursor": "475"
}
```

#### `GET /api/notifications/unread-count`

Single integer for the bell badge. Cheap - call this on socket reconnect or
on a 60 s poll if you don't have web push wired yet.

```json
{ "unread_count": 7 }
```

#### `POST /api/notifications/{id}/read`

Mark one notification as read. Idempotent. Response is the updated row.

#### `POST /api/notifications/read-all`

Marks every unread notification for the user as read. Response: `{ "updated": <int> }`.

### What the frontend needs to do

1. **Bell badge** - on app boot and on every `new_inbox_message` socket event, hit `GET /api/notifications/unread-count` and update the bell counter.
2. **Tray dropdown** - when the user clicks the bell, render the first page from `GET /api/notifications?limit=25`. Infinite-scroll using `next_cursor`.
3. **Filter toggle** - in the tray, an "Unread only" filter calls `?unread_only=true`.
4. **Click a row** - call `POST /api/notifications/{id}/read` (fire and forget) and route to the deep link:
   - `channel = "sms"`  -> SMS thread for `contact_id` / `conversation_id`.
   - `channel = "email"` -> Email thread (use `conversation_id` as thread id; backend stores Gmail/Elastic thread id there).
   - `channel = null` (kind=`system`) -> no deep link.
5. **"Mark all read" button** - call `POST /api/notifications/read-all`. Optimistically zero the badge and flip every visible row to `is_read = true`.
6. **Empty state** - "You're all caught up." Don't show fake placeholder rows.

### References

- Swagger: `/api/notifications/*` under the **Notifications** tag.
- Backend route: the notifications endpoints.
- Model: the `notification` record.
- Note: the backend doesn't yet *insert* rows into this table - that happens in **Section 3** (the cross-cutting dispatch helper). Until Section 3 is wired in production, the list will return `[]`. Test data: a manual `INSERT INTO notification (...)` row will surface immediately.

---

## Section 3 - Cross-cutting inbound dispatch helper

No new endpoints. Section 3 is the **glue** that turns an inbound SMS or
email into a `notification` row (so Section 2's bell + history work) and
fans the same payload out to the push transports added in Sections 4 and 5.

**Backend commit:** Section 3 on `thesarwars_v2`.

### What it does

Whenever a real-time inbound message lands, the backend now calls the inbound
notification dispatch helper once per recipient agent. The helper:

1. Reads the agent's per-channel pref (`notify_sms_inbound` / `notify_email_inbound` from Section 1) and silently skips if muted.
2. Inserts a `notification` row (Section 2) with:
   - `kind` = `"sms_inbound"` or `"email_inbound"`
   - `channel` = `"sms"` or `"email"`
   - `contact_id`, `conversation_id` for deep-link routing
   - `title` = contact display name / phone number / email address
   - `body` = message preview, truncated at 280 chars
3. Best-effort delivery via web push (Section 4) and mobile push (Section 5) - failures log, never raise.

### Wired into

- Telnyx inbound SMS reply handler.
- ElasticEmail inbound handler. Notifies every member of the receiving org.
- Gmail Pub/Sub-driven inbound ingest. Notifies the connection's user.

### What the frontend needs to do

**Nothing new.** The dispatch is internal. Once the user sends a real reply
from a phone or replies to an email, you'll see:

- A new row appear in `GET /api/notifications`.
- The `unread_count` from Section 2 increase by 1.
- (After Sections 4 + 5 land:) a web push or mobile push delivered to subscribed devices.

### Smoke test

After the agent has SMS configured + a contact in the system:

1. From the contact's phone, send a real reply to the agent's Telnyx number.
2. `GET /api/notifications/unread-count` for the agent's JWT should return ≥ 1 within a second.
3. `GET /api/notifications?limit=1` should return a row with `kind: "sms_inbound"`, `channel: "sms"`, the contact's number/name as `title`, and the reply text as `body`.

---

## Section 4 - Web push notifications (VAPID)

Lets the browser deliver push notifications even when WarmChats isn't open.
The user's machine pings the OS notification center and clicking it opens
the right conversation.

**Backend commit:** Section 4 on `thesarwars_v2`.

### Endpoints

#### `GET /api/notifications/vapid-public-key`  (public, no JWT)

Returns the VAPID public key the browser needs to subscribe.

```json
{ "public_key": "BFf...long base64url string..." }
```

Returns 503 if the server hasn't been configured yet (env vars
`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CONTACT_EMAIL` are missing
on the server).

#### `POST /api/notifications/subscribe`

Send the result of `pushManager.subscribe(...)`. Idempotent - calling again
with the same `endpoint` updates the row and re-activates it.

**Request body** - exactly the shape `PushSubscription.toJSON()` returns:
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": { "p256dh": "BNc...", "auth": "...8 bytes..." }
}
```

**Response 201**
```json
{ "id": 14, "status": "created" }
```
or 200 `{ "id": 14, "status": "updated" }` if the endpoint was already known.

#### `POST /api/notifications/unsubscribe`

```json
{ "endpoint": "https://fcm.googleapis.com/fcm/send/..." }
```

Soft-deletes the row so the backend stops trying to deliver to it.

### Push payload shape (received by the service worker)

When an inbound message lands and Section 3's helper fans out, each
subscribed browser receives:

```json
{
  "notification_id": 482,
  "kind": "sms_inbound" | "email_inbound",
  "channel": "sms" | "email",
  "title": "Lisa Park",
  "body": "Hey, can we move tomorrow's showing to 4 PM?",
  "contact_id": 17,
  "conversation_id": 31
}
```

### What the frontend needs to do

#### 1. Add a service worker

`public/sw.js` (registered at `/sw.js`):

```js
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'WarmChats', {
      body: data.body || '',
      icon: '/favicon-192.png',
      badge: '/badge-72.png',
      data, // forwarded into the click handler
      tag: `notif-${data.notification_id || ''}`,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const path = data.channel === 'email'
    ? `/inbox/email/${data.conversation_id || ''}`
    : `/inbox/sms/${data.conversation_id || ''}`;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.endsWith(path) && 'focus' in w) return w.focus();
      }
      return clients.openWindow(path);
    })
  );
});
```

#### 2. Register and subscribe on user opt-in

```js
// Helper to convert the base64url public key the backend gave us into a Uint8Array
const urlB64ToUint8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function enableWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Web push not supported in this browser');
  }
  const reg = await navigator.serviceWorker.register('/sw.js');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return;

  const { public_key } = await fetch('/api/notifications/vapid-public-key').then(r => r.json());

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8(public_key),
  });

  await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(sub.toJSON()),
  });
}
```

#### 3. UX

- Settings page exposes an "Enable browser notifications" toggle that calls `enableWebPush()` on first activation. Pair with the Section 1 `notify_via_web_push` flag - if the user disables that flag, you should also call `/api/notifications/unsubscribe` (with the current endpoint) to stop deliveries.
- If the user denies permission once, don't pop the prompt again until they explicitly opt in again.
- On every app boot, call `getSubscription()` and silently re-POST `/subscribe` so endpoint rotations are captured.

### Server config required

Operator must set three env vars before web push starts working:

```
VAPID_PUBLIC_KEY="<base64url public key>"
VAPID_PRIVATE_KEY="<base64url private key>"
VAPID_CONTACT_EMAIL="ops@warmchats.com"
```

Generate a keypair locally with any standard VAPID generator (for example the
`web-push` CLI's `generate-vapid-keys`). The public key must be the 65-byte
uncompressed P-256 form, base64url-encoded.

### References

- Swagger: `/api/notifications/vapid-public-key`, `/subscribe`, `/unsubscribe` under **Notifications**.
- Backend route: the push subscribe/unsubscribe endpoints.
- Sender: the web-push sender service.
- Model: the `push_subscription` record.
- VAPID spec: <https://www.rfc-editor.org/rfc/rfc8292>.
- MDN - push API: <https://developer.mozilla.org/en-US/docs/Web/API/Push_API>.
- MDN - service worker push: <https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification>.

---

## Section 5 - Mobile push (FCM)

Native iOS and Android apps register their FCM token with the backend; the
Section 3 dispatch helper now also fans out to those tokens via
`firebase-admin`.

**Backend commit:** Section 5 on `thesarwars_v2`.

### Endpoints

#### `POST /api/notifications/device-token`

Idempotent - re-registering the same token updates the row and re-activates it.

**Request body**
```json
{ "token": "fGqA...long FCM token...", "platform": "ios" }
```

`platform` must be one of `"ios"`, `"android"`, `"web"`.

**Response 201** `{ "id": 7, "status": "created" }` (or 200 `"updated"`).

#### `DELETE /api/notifications/device-token`

```json
{ "token": "fGqA..." }
```

Soft-deletes the row.

### Push payload (received by the FCM client)

`firebase-admin` sends both the `notification.title` / `notification.body`
fields **and** a `data` object. The `data` object is a flat string-only
map with the same keys as Section 4's web-push payload:

```
notification_id, kind, channel, title, body, contact_id, conversation_id
```

Use `data.channel` + `data.conversation_id` to deep-link on tap.

### What the frontend needs to do

#### iOS / Android (React Native or native)

1. Configure FCM in the app per Firebase docs.
2. After requesting notification permission and acquiring the registration token:

```ts
// React Native + @react-native-firebase/messaging
import messaging from '@react-native-firebase/messaging';

await messaging().requestPermission();
const token = await messaging().getToken();

await fetch(`${API_BASE}/api/notifications/device-token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ token, platform: Platform.OS }), // 'ios' | 'android'
});

messaging().onTokenRefresh(async (newToken) => {
  await fetch(`${API_BASE}/api/notifications/device-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ token: newToken, platform: Platform.OS }),
  });
});
```

3. On notification tap, route based on `data.channel` and `data.conversation_id`:

```ts
messaging().onNotificationOpenedApp((msg) => {
  const d = msg.data || {};
  if (d.channel === 'sms') router.push(`/inbox/sms/${d.conversation_id}`);
  else if (d.channel === 'email') router.push(`/inbox/email/${d.conversation_id}`);
});
```

4. On user logout, call `DELETE /api/notifications/device-token` with the current token so the previous user stops getting pushes.

### Server config required

Set one of:

```
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
# OR
FIREBASE_SERVICE_ACCOUNT_PATH=/etc/secrets/firebase-service-account.json
```

The service account must have the **Firebase Cloud Messaging Admin** role.

### References

- Swagger: `/api/notifications/device-token` under **Notifications**.
- Backend route: the device-token endpoint.
- Sender: the mobile-push sender.
- Model: the `device_token` record.
- Firebase Admin SDK: <https://firebase.google.com/docs/admin/setup>.
- React Native Firebase Messaging: <https://rnfirebase.io/messaging/usage>.

---

## Section 6 - Channel connection status

Single endpoint the Inbox UI calls on mount (and whenever the user finishes
connecting a channel) to know whether to render the SMS tab, the Email tab,
or the "connect/upgrade" modal.

**Backend commit:** Section 6 on `thesarwars_v2`.

### Endpoint

#### `GET /api/me/channels`

**Response 200**
```json
{
  "sms": {
    "connected": true,
    "provider": "telnyx",
    "phone_number": "+15551234567",
    "status": "approved",
    "campaign_number_status": "assigned"
  },
  "email": {
    "connected": true,
    "provider": "gmail",
    "address": "lisa@warmchats.com",
    "verified": true,
    "can_receive": true
  }
}
```

**SMS connected = true** iff the user has both `telnyx_phone_number` set
*and* `telnyx_sms_status === "approved"`. Anything pending/rejected
shows as `connected: false` so the UI gates the SMS tab.

**Email connected = true** iff there is a verified `inbox_connection`
row. `provider` is the literal string the row stores (`"gmail"` or
`"elastic"`).

### What the frontend needs to do

1. **App boot** - call `GET /api/me/channels` once. Cache the response in your auth/profile store.
2. **Inbox tabs** - render SMS / Email / Unified, but *gate* each:
   - SMS connected: show messages.
   - SMS not connected: show "Connect SMS to start texting leads" with a CTA to the existing Telnyx onboarding flow.
   - Email connected: show messages.
   - Email not connected: show "Connect your email" with a CTA to the existing email connect flow (Gmail OAuth or ElasticEmail SMTP setup).
   - Unified tab: visible whenever at least one channel is connected.
3. **Onboarding/upgrade modal** - when the user clicks a disabled tab:
   - SMS: route to `/onboarding/sms` (Telnyx activation).
   - Email: open the existing "Connect inbox" modal.
4. **After connecting** - re-fetch `/api/me/channels` and update the cache so the gated UI flips immediately.
5. **Status pill** - for SMS, render a small chip next to the tab using `sms.status`:
   - `approved` (green): "Live"
   - `pending` (amber): "Pending review"
   - `rejected` (red): "Action needed" -> click opens the existing Telnyx error reason copy.

### References

- Swagger: `/api/me/channels` under **Notifications**.
- Backend route: the `me/channels` endpoint.
- SMS connected derivation: on the user record - `telnyx_phone_number` + `telnyx_sms_status`.
- Email connected derivation: `InboxConnection.is_verified`.

---

## Section 7 - Template preview endpoint

Renders a draft body (and optional subject) the way it will be sent -
useful for the composer's "Preview" toggle (PDF page 8 / 13 / 18).

**Backend commit:** Section 7 on `thesarwars_v2`.

### Endpoint

#### `POST /api/inbox/preview`

**Request body**
```json
{
  "body": "Hey {firstname}, just confirming our 3 PM showing.",
  "subject": null,
  "contact_ids": [17, 22, 39]
}
```

| Field | Type | Notes |
|---|---|---|
| `body` | string \| null | SMS body or email body. Required if `subject` is null. |
| `subject` | string \| null | Email subject. Optional/null for SMS. |
| `contact_ids` | int[] (1-500) | Recipients. The first id is used to render the sample. |

**Response 200 (single recipient)**
```json
{
  "preview": {
    "subject": null,
    "body": "Hey Lisa, just confirming our 3 PM showing.",
    "contact_id": 17
  },
  "recipient_count": 1
}
```

**Response 200 (bulk)**
```json
{
  "preview": {
    "subject": null,
    "body": "Hey Lisa, just confirming our 3 PM showing.",
    "contact_id": 17
  },
  "recipient_count": 3,
  "note": "Each recipient will receive their own personalized version"
}
```

**Errors**
- `400 { "error": "Unknown personalization field: {xyz}" }` - same validation that blocks send.
- `400 { "error": "contact_ids must be a non-empty list" }`.
- `400 { "error": "body or subject is required" }`.
- `404 { "error": "Contact <id> not found" }` - sample contact missing.

### What the frontend needs to do

1. **Composer "Preview" toggle** - when toggled on, debounce input changes (~250 ms), POST the current `body` / `subject` / selected `contact_ids`, and render the response's `preview.subject` + `preview.body` in a read-only pane.
2. **Bulk preview note** - when `note` is present, render it under the preview ("Each recipient will receive their own personalized version") so the user understands they're seeing one sample.
3. **Validation surfaces** - if the response is a 400 with `"Unknown personalization field"`, highlight the offending token (parse the message - backend wraps the bad token in `{}`) and disable the Send button until fixed.
4. **Cheap calls** - this endpoint reads one Lead row, so calling on every keystroke after debounce is fine.

### References

- Swagger: `/api/inbox/preview` under **Inbox**.
- Backend route: the inbox preview endpoint.
- Personalization util: the shared personalization helper.
- Token validator (same one the send path uses): `validation_error_for_unknown_tokens` in the util above.

---

## Section 8 - `Lead.area` field + `{Area}` token

PDF page 7 lists `{Area}` in the SMS Personalize dropdown ("contacts area").
This section adds a free-text `area` field to the lead record and registers
the new tokens with the personalization engine.

**Backend commit:** Section 8 on `thesarwars_v2`.

### What's new on the API surface

#### Lead JSON now includes `area`
- Returned by `GET /leads/<id>` and `GET /leads`.
- Accepted by `POST /leads` (create) and `PATCH /leads/<id>` (update).
- Type: `string \| null`, max length 120.
- CSV import recognizes the column under the names: `area`, `lead_area`, `city`, `neighborhood`, `neighbourhood`.

#### Personalization tokens added
The composer's "Personalize" dropdown should now offer:

| Token (display) | Renders as |
|---|---|
| `{Area}` / `{area}` / `{lead_area}` | `lead.area` (empty string if null - *not* the "there" fallback) |
| `{senderfullname}` / `{SenderFullName}` / `{sender_full_name}` | `user.name` |
| `{Sendername}` / `{sender_name}` / `{sendername}` | `user.name` |

Plus the existing tokens documented in the Section 7 frontend section.

All token resolution is **case-insensitive**: `{Area}`, `{area}`, `{AREA}`
all render the same value.

### What the frontend needs to do

1. **Lead form** - add an "Area" field next to "Property Address" in the lead create / edit form. Free text, optional.
2. **Lead detail view** - display `area` if present (next to property address or in the "About" panel).
3. **Composer "Personalize" dropdown** - extend the dropdown so it now lists, for SMS:
   - `{firstname}`, `{lastname}`, `{Area}`, `{senderfullname}`, `{Sendername}`
   And for Email:
   - `{firstname}`, `{lastname}`, `{senderfullname}`
4. **CSV import preview** - recognize "Area" / "City" / "Neighborhood" column headers and let the user map them to `area`.
5. **Preview endpoint** - Section 7's `/api/inbox/preview` automatically renders `{Area}` once the lead has the value set; no frontend change needed beyond exposing the new tokens in the dropdown.

### Behavior notes

- **Empty area** - `{Area}` renders as an empty string when the lead has no area set. This is intentional and different from `{firstname}` which falls back to `"there"`. Do not block the send if a contact's area is missing.
- **Send-time render** - exactly the same model the existing personalization uses: tokens stay literal in the editor, get rendered just before send (or for preview when the user toggles preview).

### References

- Token registry: the personalization helper - see `TOKEN_ALIASES` and `build_personalization_context`.
- Lead model: new `area` column on the lead record.
- Routes accepting `area`: the leads routes.

---

## Section 9 - SMS attach-and-send (verified existing + hardened)

PDF page 6: "User needs to be able to send a photo or send files if needed
in inbox messaging 1 on 1." The backend pipe (upload -> URL -> SMS send with
media) was already implemented end-to-end. Section 9 verifies that path,
adds Telnyx's MMS limits (max 10 media items, allowed content-type
prefixes), and documents the two-step flow for the frontend.

**Backend commit:** Section 9 on `thesarwars_v2`.

### Two-step flow

#### Step 1 - Upload the file(s)

`POST /api/inbox/attachments/upload` (multipart/form-data; existing endpoint)

Form field: `files` (one or more). Each file ≤ 20 MB.

**Response 200**
```json
{
  "attachments": [
    {
      "id": "5b1f...",
      "url": "https://www.warmchats.com/api/media/message-attachments/5b1f.../property.jpg",
      "name": "property.jpg",
      "content_type": "image/jpeg",
      "size": 184320
    }
  ]
}
```

#### Step 2 - Send the SMS with attachments

`POST /api/messages/send` - pass the entire array under `attachments`:

```json
{
  "to": "+14155551234",
  "client_request_id": "550e8400-e29b-41d4-a716-446655440000",
  "body": "Here's the listing photo for {firstname}",
  "attachments": [
    {
      "url": "https://www.warmchats.com/api/media/message-attachments/5b1f.../property.jpg",
      "content_type": "image/jpeg",
      "name": "property.jpg",
      "size": 184320
    }
  ]
}
```

The backend extracts `url`s and forwards them to Telnyx as `media_urls`.
The full `attachments` array is persisted on the message row so it shows
up in the conversation thread on both sender's and receiver's sides.

### Limits (enforced by the backend)

| Limit | Value | Source |
|---|---|---|
| Max attachments per message | 10 | Telnyx MMS limit |
| Max file size per upload | 20 MB | App `MAX_FILE_BYTES` |
| Allowed content type prefixes | `image/`, `video/`, `audio/` | Telnyx-supported MIME for MMS |
| Body required only when attachments empty | yes | Backend lets you send media-only |

Attempting to exceed these returns 400 with a descriptive error.

### What the frontend needs to do

1. **Composer UI** - add a paperclip / image icon. On click, open the OS file picker (multiple selection). For images, show inline thumbnails; for video/audio, show name + size.
2. **Upload step** - call `/api/inbox/attachments/upload` *as the user picks files*, before clicking Send. Disable the Send button while uploads are in flight; show a small progress spinner per attachment.
3. **Validate client-side** - reject files outside the allowed prefixes early so the user gets immediate feedback.
4. **Send step** - pass the response objects through unchanged into the `attachments` array of `/api/messages/send`.
5. **Body optional when attachments present** - let the user send a media-only message with empty body. Don't disable the Send button just because the body is blank.
6. **MMS character counter** - when at least one attachment is present the message is forced to MMS by Telnyx; the SMS-only character cap (160 / segment) doesn't apply. Frontend should hide or grey out the character counter when an attachment is attached.

### References

- Swagger: `/api/messages/send` under **SMS**.
- Send endpoint: the SMS-send route.
- Telnyx send: the Telnyx `send_sms` helper.
- Upload endpoint: the message-attachments route.
- Telnyx MMS limits: <https://developers.telnyx.com/api/messaging/send-message>.

---

## Section 10 - Schedule send for 1-to-1 messages

PDF page 8 / 13: "Send later (clock icon ⏱) - Schedule follow-ups. Same
scheduling as automations just this is for a single lead not a campaign."

The composer's clock icon now stores the draft and dispatches it at the
chosen time via the backend's existing send paths.

**Backend commit:** Section 10 on `thesarwars_v2`.

### Lifecycle

```
scheduled  ->  sending  ->  sent
                       ->  failed (with error_message)

scheduled  ->  cancelled (user-initiated DELETE)
```

A `BackgroundScheduler` job runs every 60 seconds, atomically claims rows
whose `scheduled_at <= now` (status flips to `sending`), and dispatches
each via the same Telnyx send / SMTP send the live composer uses.
**Personalization tokens render at dispatch time**, not at schedule time -
so a contact's first_name update between schedule and send is honored.

### Endpoints

#### `POST /api/inbox/scheduled` - schedule a message

```json
{
  "channel": "sms",
  "to_address": "+14155551234",
  "body": "Hey {firstname}, following up on the showing.",
  "contact_id": 17,
  "send_at": "2026-05-06T20:00:00Z"
}
```

For email:
```json
{
  "channel": "email",
  "to_address": "lisa@example.com",
  "subject": "Re: 123 Main St",
  "body": "Hi {firstname}, ...",
  "contact_id": 17,
  "send_at": "2026-05-06T20:00:00Z"
}
```

**Response 201**
```json
{
  "id": 88,
  "user_id": 4,
  "org_id": 2,
  "contact_id": 17,
  "channel": "sms",
  "to_address": "+14155551234",
  "subject": null,
  "body": "Hey {firstname}, following up on the showing.",
  "attachments": [],
  "scheduled_at": "2026-05-06T20:00:00",
  "status": "scheduled",
  "error_message": null,
  "sent_message_id": null,
  "sent_at": null,
  "created_at": "2026-05-05T15:14:02"
}
```

**Errors**
- `400 { "error": "send_at must be in the future" }`
- `400 { "error": "Unknown personalization field: {xyz}" }` - same validation as the live send.
- `400 { "error": "channel must be one of ['sms', 'email']" }`
- `400` for invalid phone (sms) or missing required body/subject.
- `403 { "error": "User not part of organization" }`.
- `404` if `contact_id` does not resolve.

#### `GET /api/inbox/scheduled?status=scheduled`

Returns up to 200 rows for the signed-in user, ordered by `scheduled_at` ascending. Status filter is optional.

```json
{ "items": [ {"id": 88, ...}, {"id": 89, ...} ] }
```

#### `PATCH /api/inbox/scheduled/{id}`

Allowed fields: `body`, `subject`, `attachments`, `send_at`. Only works while `status == "scheduled"`. Returns 409 if the row already moved to `sending` / `sent` / `failed` / `cancelled`.

#### `DELETE /api/inbox/scheduled/{id}`

Cancels a still-pending row (status flips to `cancelled`). Returns 409 once it's left the `scheduled` state.

### What the frontend needs to do

#### Composer

1. **Clock icon ⏱** - opens a date/time picker. Disable past times. Default to "Tomorrow at 9 AM" in the user's timezone. Convert to UTC ISO 8601 before posting.
2. **Submit "Send later"** - POST `/api/inbox/scheduled` with the same body shape as `/api/messages/send` plus `send_at`. On 201 close the composer and surface a toast: "Scheduled for &lt;local time&gt;. View your scheduled messages ->" linking to the list view.

#### Scheduled-messages list view

3. **List page** - GET `/api/inbox/scheduled?status=scheduled`. Columns: contact (resolve from `contact_id` or `to_address`), channel chip, send time (in user TZ), preview of `body`, edit/cancel actions.
4. **Edit row** - open the composer pre-filled. On save, PATCH the row with the changed fields. Disable the form when `status !== "scheduled"`.
5. **Cancel row** - DELETE; optimistically remove from the list. On 409 (already sent), refresh the row from the API.
6. **History tab** - same endpoint with `?status=sent` and `?status=failed`. Failed rows show `error_message`; offer a "Resend now" button that POSTs `/api/messages/send` (or the email equivalent) with the failed row's body/attachments.

#### Smoke test

```bash
# Schedule
curl -X POST localhost:5001/api/inbox/scheduled \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"channel":"sms","to_address":"+14155551234","body":"hi {firstname}","contact_id":17,"send_at":"2026-05-06T20:00:00Z"}'

# Within 60s of `send_at`, the row will flip to status=sent and a real
# SmsMessage row will be created. `sent_message_id` points at it.
```

### Operational notes

- Tick interval is 60 seconds. Worst-case delay between `send_at` and actual delivery is ~60 s.
- The dispatch job is single-instance with coalescing so overlapping ticks won't double-fire.
- Row claims are atomic so concurrent workers won't dispatch the same row twice.
- Set `ENABLE_SEQUENCE_SCHEDULER=false` to disable both the existing sequence tick and the new scheduled-messages tick (e.g. on workers that should not run background jobs).

### References

- Swagger: `/api/inbox/scheduled[/{id}]` under **Inbox**.
- Routes: the inbox scheduled-messages endpoints.
- Dispatcher: the scheduled-message dispatcher.
- Model: the `scheduled_message` record.

---

## Section 11 - Real-estate persona on AI Assist

PDF page 7: "Make sure ai is a real estate genius and can help with
anything related to real estate/business." The composer's ⚡ AI Assist
button now talks to a model that is explicitly framed as an expert
real-estate agent and that preserves all `{token}` placeholders verbatim.

**Backend commit:** Section 11 on `thesarwars_v2`.

### Endpoint (existing path, expanded contract)

#### `POST /ai/generate/improve`

**Request body** - what changed:

```json
{
  "message": "Hey {firstname}, are you free Saturday for a showing?",
  "selection": "are you free Saturday for a showing",
  "mode": "rewrite_selection",
  "channel": "sms",
  "tone": "Friendly",
  "persona": "Real Estate Agent",
  "lead_data": []
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | string | yes | Full draft body. Always send the whole thing so the rewrite stays coherent. |
| `selection` | string | yes when `mode=rewrite_selection` | The highlighted substring. The model rewrites only this. |
| `mode` | `rewrite_full \| rewrite_selection` | no | Defaults to `rewrite_selection` if `selection` was sent, otherwise `rewrite_full`. |
| `channel` | `sms \| email \| whatsapp \| linkedin` | no | Drives length / format. Defaults to `email`. |
| `tone` | string | no | e.g. `Friendly`, `Professional`, `Casual`. Defaults to `Friendly`. |
| `persona` | string | no | Defaults to `Real Estate Agent`. The system prompt enforces real-estate framing regardless. |
| `lead_data` | array | no | Optional context. |

**Response 200**
```json
{
  "improved_message": "Hey {firstname}, want to swing by Saturday for a quick walk-through of 123 Main St?",
  "suggestions": [
    "Hi {firstname} - got a slot Saturday afternoon? I'd love to show you 123 Main St.",
    "{firstname}, the listing on Main is open Sat. Want me to hold a 2 PM walk-through for you?",
    "Quick one, {firstname} - Saturday tour open. Reply YES and I'll lock it in."
  ],
  "intent": "Interested",
  "mode": "rewrite_selection",
  "chars": 95
}
```

**Errors**
- `400 { "error": "Message is required" }`
- `400 { "error": "mode must be 'rewrite_full' or 'rewrite_selection'" }`
- `400 { "error": "selection is required for mode=rewrite_selection" }`

### Behavior notes

- **Tokens are preserved.** The model is explicitly told to keep
  `{firstname}`, `{lastname}`, `{fullname}`, `{email}`, `{phone}`, `{Area}`,
  `{senderfullname}`, `{Sendername}` verbatim. They are NOT resolved at
  rewrite time - the live send path handles that.
- **SMS length.** When `channel=sms` the system prompt instructs the model
  to keep the rewrite under 160 characters. The response includes `chars`
  so the frontend can flag if the model went over.
- **Selection mode.** The full message is sent for context but the model
  is told to return ONLY the rewritten selection. The frontend then
  splices that result back into the original draft using the same
  start/end offsets it captured at button-click.

### What the frontend needs to do

#### ⚡ AI Assist button

1. **Place the button** in the composer toolbar (PDF page 6 / 7 / 11).
2. **On click without a selection** (cursor anywhere): open the popup
   ("Get an improved version quickly"), POST with `mode=rewrite_full`,
   show the rewritten body + the three alternatives. Clicking an
   alternative replaces the body wholesale.
3. **On click with text selected** in the composer:
   - Capture the selection substring AND its `[start, end]` offsets in the body.
   - POST with `mode=rewrite_selection`, `selection=<substring>`, `message=<full body>`.
   - On 200, splice `improved_message` into the body using `body.slice(0, start) + improved_message + body.slice(end)`. Update offsets if you need to keep the cursor in place.

#### Popup UI

Per PDF page 7 / 8:

- Heading: "AI Assist" with the ⚡ icon.
- A "Rewrite" primary action.
- The three alternatives surfaced as click-to-replace cards.
- Footer chip showing `chars` value when channel=sms (red if > 160).

#### SMS character cap

Combine with the Section 9 SMS counter (already in the composer): once
the rewrite lands, refresh the count from the new body and warn if it
crossed 160.

### References

- Swagger: `/ai/generate/improve` under **AI**.
- Backend route: the AI-improvement endpoint (`generate_ai_improvement`).
- AI service: the AI provider helper - see `generate_message_improvement` and the `system_prompt` in `generate_ai_text`.
- Model: OpenAI `gpt-4o-mini` via `OPENAI_API_KEY` (OpenAI is the only provider).
