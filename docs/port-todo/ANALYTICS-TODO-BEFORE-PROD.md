# Warmchats - Agent Notes

## Mixpanel Analytics

### Configuration
- SDK: `mixpanel-browser` (direct, no CDP)
- Token env var: `VITE_MIXPANEL_TOKEN` (set in `.env` and `.env.development`)
- Init: [src/main.tsx](src/main.tsx) calls `initMixpanel()` before render; if a session is already in `localStorage`, it also calls `mixpanelIdentify()` so reloads keep attribution.
- Wrapper: [src/lib/mixpanel.ts](src/lib/mixpanel.ts) - never call `mixpanel.*` directly from components.
- Compliance: US-only, no consent gate. **If EU/EEA/UK/CA users are ever added**, gate `initMixpanel()` behind a consent banner before any tracking call.

### Identity lifecycle
Identity is wired at the auth-state choke points in [src/utils/authSession.ts](src/utils/authSession.ts) so every login surface (email/password, Google, signup, token refresh) and every logout (manual, session expiry, 401 fallback) is covered:
- `storeAuthSession(payload)` -> `mixpanelIdentify(user_id, { email, name, org_id, org_name, role, plan })`
- `clearStoredAuthState()` -> `mixpanelReset()`

**Do not add identify/reset calls in components.** If a new auth path appears, route it through these two functions.

### Events

| Event | Where | Properties | Purpose |
|---|---|---|---|
| `sign_up_completed` | [src/components/SignUp.tsx](src/components/SignUp.tsx) (email/password success) | `method: "email"` | Activation top-of-funnel. **TODO:** also fire on Google signup once backend returns `is_new_user`. |
| `first_message_sent` | [src/components/NewMessage.tsx](src/components/NewMessage.tsx), [src/components/inbox/Inbox.tsx](src/components/inbox/Inbox.tsx) | `channel: "Email" \| "SMS"`, `recipient_count: number`, `sender_type?`, `surface: "new_message" \| "thread_reply"` | **Value Moment.** Fires once per user (gated by `mp_first_message_sent:<user_id>` flag in localStorage). The unified inbox composer fires it for both channels (`surface: "thread_reply"`). |

### Adding new events
1. Use `snake_case` event names. No dynamic names.
2. Numeric properties stay numeric (don't stringify counts/prices).
3. Import `track` from `src/lib/mixpanel`; do not import `mixpanel-browser` directly outside that file.
4. Add the new event to the table above.

### Verification
Run dev, log in, send a message, then open Mixpanel -> Live View. Expect: `sign_up_completed` (on registration), `first_message_sent` (on first send), and the implicit `$identify` / `$pageview` events with the correct `distinct_id = user_id`.

Also check:
- **Users page** (Mixpanel -> Users -> User Profiles): the logged-in user should appear with `$email`, `$name`, `org_id`, `org_name`, `role`, `plan`. Profiles are written inside `mixpanelIdentify` via `people.set`.
- **Replays page** (Mixpanel -> Replays): a recording should appear within a minute of the session. Recording is enabled in `initMixpanel` via `record_sessions_percent`.

### Session Replay
Configured in [src/lib/mixpanel.ts](src/lib/mixpanel.ts):
- `record_sessions_percent: 100` - currently 100% in both dev and prod for initial verification. **Dial down for prod** (10-25% is typical) once you've confirmed coverage, to control cost.
- `record_mask_text_selector: "*"` - masks all text by default. This is intentional for a CRM (lead PII, message bodies, phone numbers everywhere). To selectively unmask, tighten the selector - never set it to a value that exposes lead/message content.
- `record_block_selector: ".mp-block"` - add the `mp-block` class to any element you want blocked entirely from replays (e.g. attachment previews, contact phone fields).
