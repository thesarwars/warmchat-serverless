# WarmChats <-> Zapier: full two-way CRM integration

## Context

The client wants leads captured in ManyChat (and other tools) to flow into WarmChats automatically, get an instant response, be qualified by AI, and be driven toward an appointment (see `docs/Zapier ManyChats to WarmChats.md`). The chosen delivery mechanism is **Zapier**: WarmChats becomes a published Zapier app so a Zap can use ManyChat (or anything) as the Trigger and WarmChats as the Action - and vice-versa.

Key finding from exploring the codebase:

- The **AI follow-up flow the doc describes already exists** in WarmChats (`qualificationFlow.ts`, automations, scoring, appointment booking, `notify()` agent handoff). Zapier's real job is **intake + enrollment**, not rebuilding that flow.
- **Lead creation already exists** (`POST /api/leads`) - we factor its logic into a shared helper and reuse it.
- **The one true gap is a Zapier-usable credential.** Every `/api/**` route authenticates via a browser session cookie or a 1-hour JWT (`requireUser`), so there is nothing a standing Zap can hold. We must add a **long-lived per-org API key**.

Scope (confirmed with the user): full integration with a real key-management UI; per-org **API key** auth (OAuth deferred); a **dedicated** api-key-authed intake endpoint idempotent on an external id; intake **may optionally enroll** the lead into the AI workflow; the app must be **generic** (a WarmChats CRM app, ManyChat is just one consumer) and **two-way** (WarmChats events as Zapier triggers). Plus a walkthrough to publish/upload the app to Zapier.

Note: this does not conflict with the project's "no external CRM integration" rule - that rule forbids syncing WarmChats *out* to HubSpot/Salesforce. This is pulling leads *in* and exposing our own data, like a lead-capture source.

## Architecture

```
ManyChat (or any app)  --Zapier Trigger-->  Zapier  --Action: POST /api/integrations/v1/leads (Bearer API key)-->  WarmChats
                                                                                                                       |
                                                                       createOrUpdateLead() + optional enrollment (queueAutomationForLead)
                                                                                                                       |
WarmChats event (lead.created / lead.replied / lead.status_changed / appointment.booked)
        --dispatchZapierEvent()--> POST to subscribed Zapier REST Hook URLs --> Zapier Trigger fires the next Zap
```

- **Auth:** per-org API key `wc_live_<base64url-random>`, stored SHA-256-hashed (high-entropy key, so SHA-256 is safe and cheap - no PBKDF2, stays under the 10ms CPU cap). Only `key_prefix` is shown in the UI after creation.
- **Triggers:** REST Hooks (instant) backed by a per-org subscription table; WarmChats POSTs out via `fetch` inside `waitUntil` (network wait, not CPU). Each trigger also has a polling `GET` list endpoint for Zapier sample data + fallback.
- **Actions/Searches:** versioned `/api/integrations/v1/**`, all api-key-authed, reusing existing lead/automation/tag helpers.

## Phase 1 - Schema (no migrations; fold into sql files)

New file **`sql/19.create-integrations.sql`**:

```sql
-- Per-org long-lived API keys for external integrations (Zapier, etc.).
CREATE TABLE IF NOT EXISTS api_key (
    id                  INTEGER PRIMARY KEY,
    org_id              INTEGER NOT NULL REFERENCES organization (id),
    created_by_user_id  INTEGER REFERENCES "user" (id),
    name                TEXT NOT NULL,
    key_prefix          TEXT NOT NULL,              -- e.g. "wc_live_3f9a" for display
    key_hash            TEXT NOT NULL,              -- SHA-256 hex of the full key
    scopes              TEXT NOT NULL DEFAULT 'leads:write,leads:read',
    last_used_at        TEXT,
    created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
    revoked_at          TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_key_hash ON api_key (key_hash);
CREATE INDEX IF NOT EXISTS ix_api_key_org ON api_key (org_id);

-- Zapier REST Hook (instant trigger) subscriptions: WarmChats POSTs events here.
CREATE TABLE IF NOT EXISTS integration_subscription (
    id          INTEGER PRIMARY KEY,
    org_id      INTEGER NOT NULL REFERENCES organization (id),
    api_key_id  INTEGER REFERENCES api_key (id),
    event       TEXT NOT NULL,                      -- lead.created | lead.replied | lead.status_changed | appointment.booked
    target_url  TEXT NOT NULL,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_sub ON integration_subscription (org_id, event, target_url);
CREATE INDEX IF NOT EXISTS ix_integration_sub_lookup ON integration_subscription (org_id, event);
```

Edit **`sql/2.create-leads.sql`** - add to the `lead` table (for idempotent upsert + the ManyChat platform):

```sql
    external_id   TEXT,   -- external system id (e.g. ManyChat subscriber id) for idempotent upsert
    platform      TEXT,   -- capture platform: Instagram | Facebook | Website | ...
```
plus `CREATE INDEX IF NOT EXISTS ix_lead_org_external ON lead (org_id, external_id);`

Edit **`sql/0.drop-tables.sql`** - add `DROP TABLE IF EXISTS integration_subscription;` and `DROP TABLE IF EXISTS api_key;` (before `organization`/`user`).

Load with `pnpm db-fast` (local) / `pnpm db-fast-remote` (remote, where the user tests).

## Phase 2 - API-key auth helpers

- **`functions/_shared/apiKeys.ts`** (new):
  - `generateApiKey(): { full: string; prefix: string }` - `crypto.getRandomValues(new Uint8Array(32))` -> base64url -> `wc_live_<rand>`; `prefix` = `wc_live_` + first 4 chars.
  - `hashApiKey(full: string): Promise<string>` - single `crypto.subtle.digest("SHA-256")` -> hex.
- **`functions/_shared/apiAuth.ts`** (new):
  - `requireApiKey(env, request, scope?): Promise<{ orgId: number; apiKeyId: number; userId: number | null; scopes: string[] } | null>` - read `Authorization: Bearer <key>` (also accept `X-API-Key`), hash, `SELECT ... FROM api_key WHERE key_hash = ? AND revoked_at IS NULL`, fire-and-forget `UPDATE last_used_at`, enforce `scope` if given. Resolves org with **no session** - this is the whole point. Mirror `http.ts` `error()` shape for 401/403.

## Phase 3 - Key management API + UI

- Session-authed routes (use existing `requireUser` + `isOrgMember`):
  - `functions/api/integrations/keys/index.ts` - `GET` list (id, name, key_prefix, scopes, last_used_at, created_at, revoked_at - never the hash), `POST` create (generate -> store hash -> **return the full key once** in the response).
  - `functions/api/integrations/keys/[id].ts` - `DELETE` revoke (set `revoked_at`), immediate.
- UI home = the **real, wired** Connected Accounts page (`src/components/connected-accounts/ConnectedAccountsPage.tsx`), not the settings placeholder. Add an **"API & Integrations"** section matching that page's existing section/toast/`run()` patterns: list keys, "Generate key" (shows the full key once with a copy button + warning it won't be shown again), revoke, and a **"Connect with Zapier"** card with the base URL + steps. New API client `src/api/integrations.ts`.

## Phase 4 - Zapier-facing REST API (`/api/integrations/v1/**`, all api-key authed)

First refactor: extract the create/dedupe/timezone logic from `functions/api/leads/index.ts` into **`functions/_shared/leadIntake.ts`** `createOrUpdateLead(env, { orgId, ownerId, ...fields, mode })` with `mode: "create" | "upsert"`. Session endpoint keeps `mode:"create"` (preserves its 409-on-duplicate behavior); the integration endpoint uses `mode:"upsert"` (find by `external_id` -> email -> phone, else create). This avoids duplicating logic and keeps both paths consistent.

| Method & path | Purpose | Notes |
|---|---|---|
| `GET /me` | Zapier connection test/label | returns `{ org_id, org_name }` for the auth screen |
| `POST /leads` | **Create/Update Lead** (intake) | upsert by external_id/email/phone; set `source`, `platform`, map custom fields to `notes`/`tags`; optional `automation_id` + `inbound_enabled` -> `queueAutomationForLead` + `ai_status` |
| `GET /leads?email=&phone=` | **Find Lead** (search) | enables Zapier find-or-create |
| `GET /leads?since=` | New-leads list | newest-first, stable `id`; trigger sample data + polling fallback |
| `PATCH /leads/{id}` | **Update Lead** | partial update, org-scoped |
| `POST /leads/{id}/tags` | **Add Tag** | reuse on-demand tag create + `lead_tags` (from import path) |
| `POST /leads/{id}/enroll` | **Enroll in Automation** | `queueAutomationForLead`; sets `ai_status` |
| `GET /replies?since=` | Lead-replied list | polling fallback for that trigger |
| `GET /appointments?since=` | Appointments list | polling fallback |
| `POST /hooks` | REST Hook subscribe | body `{ event, target_url }` -> insert `integration_subscription` |
| `DELETE /hooks/{id}` | REST Hook unsubscribe | |

Enrollment uses existing `queueAutomationForLead` (one automation per lead, cancels prior drip) and the `apply-ai` `ai_status` semantics (`active` / `outbound` / `off`). The doc's "instant response within 30-60s" is the automation's opening message dispatched by the once-a-minute cron.

## Phase 5 - Event dispatch for instant triggers

- **`functions/_shared/zapierDispatch.ts`** (new): `dispatchZapierEvent(env, orgId, event, payload, waitUntil?)` - `SELECT target_url FROM integration_subscription WHERE org_id=? AND event=?`, then for each, fire-and-forget `POST` the JSON. Use `context.waitUntil(...)` where the Pages Function has it; in shared helpers that only carry `env`, fall back to an awaited `fetch(url, { signal: AbortSignal.timeout(2500) })` wrapped in try/catch (failures must never block the user path).
- Hook points (v1):
  - `lead.created` - inside `createOrUpdateLead` post-insert (covers the session endpoint + the integration intake) and the cold-inbound insert in `inboundProcessing.ts`. **Exclude** bulk import (would storm Zapier).
  - `lead.replied` - `inboundProcessing.ts` where `last_reply_at` is set.
  - `lead.status_changed` - once per `advanceQualification` turn in `qualificationFlow.ts` (dedupe so multiple field writes in one turn fire once).
  - `appointment.booked` - `appointmentConfirmations.ts`, alongside the existing `notify("appointment_booked")`.
- Cron-fired events (appointment reminder, automation completed) would need the `workers/cron/_shared` mirror - **deferred to a follow-up** to keep `pnpm lint`/knip green (no unused mirror until it's wired).

## Phase 6 - The Zapier app + publish walkthrough

Build with the **Zapier Platform CLI** as an in-repo Node project (versioned, reviewable) - **`zapier-app/`**:

```
zapier-app/
  package.json
  index.js                 # App definition: authentication, triggers, creates, searches
  authentication.js        # type: "custom" (API Key); test -> GET /me; connectionLabel from org_name
  middleware.js            # inject Authorization: Bearer {{bundle.authData.api_key}}
  triggers/
    new_lead.js            # REST Hook: subscribe POST /hooks, unsubscribe DELETE /hooks/{id}, perform (hook), performList GET /leads?since=
    lead_replied.js
    lead_status_changed.js
    appointment_booked.js
  creates/
    create_lead.js         # POST /leads (the intake action)
    add_tag.js             # POST /leads/{id}/tags
    enroll_lead.js         # POST /leads/{id}/enroll
  searches/
    find_lead.js           # GET /leads?email=&phone=
```

(Visual Builder is an alternative but the CLI keeps the app in source control.)

**Publish/upload walkthrough** (put in `docs/zapier/PUBLISHING.md`):
1. `npm i -g zapier-platform-cli`; `zapier login`.
2. From `zapier-app/`: `zapier register "WarmChats"` (first time) then `zapier push` to upload the version.
3. In the Zapier UI the app now appears (private) with its Triggers/Creates/Searches; test each with a real WarmChats API key.
4. Versioning: bump `version` in `package.json`, `zapier push`, `zapier promote <version>`, `zapier migrate <old> <new>` to move users.
5. Share **without public listing**: generate a private **Secret Invite Link** (or `zapier users:add <email>`) for clients/internal team.
6. Optional: submit for the public Zapier app directory once stable.

## Compliance (top priority)

- Intake sets `sms_consent_status` from the payload, default `'unknown'`; **never auto opt-in**.
- Enrollment only queues `scheduled_message`; actual sends stay gated at send time by `quietHours` + `sendRateLimiter` + opt-out - unchanged.
- API keys stored **hashed**; revocation is immediate (`revoked_at`, checked on every `requireApiKey`).
- Add the new key + intake endpoints to the Cloudflare **WAF** rate-limit rule (dashboard, not code) - doc note in `docs/zapier/PUBLISHING.md`.

## Verification

- `pnpm db-fast` to load the new schema locally; `pnpm lint` must be fully green (ESLint 0, tsc 0, knip 0) after each phase.
- `pnpm dev-ws` + `pnpm dev` (+ `pnpm dev-cron` for enrollment dispatch). With `MOCK_SEND_APIS=1`, enrolled sends land in `mock_send_log` (`pnpm mock:logs`).
- End-to-end: create a key in Connected Accounts -> `curl` `GET /api/integrations/v1/me` with the Bearer key -> `POST /leads` with `{external_id, name, phone, source:"ManyChat", platform:"Instagram", automation_id}` -> confirm the lead appears, dedupe works on a second POST, and the automation drip queues. Subscribe a `target_url` (e.g. a webhook.site URL) via `POST /hooks`, create a lead, confirm the POST fires.
- The user tests on the **remote** deploy: `pnpm upload` + `pnpm upload-cron`, and `pnpm db-fast-remote` for the schema.

## Open questions / risks

- Confirm `ConnectedAccountsPayload` exposes `org_id` to the page (needed for the keys API); if not, read it where the page already gets org context.
- `lead.status_changed` dedupe within one qualification turn (avoid multi-fire).
- OAuth2 is deferred; if the user later wants the polished "Log in & authorize" Zapier popup, it's an additive `authentication.js` change + new authorize/token routes.
- Cron-side triggers (reminders, automation-completed) are a deliberate follow-up, not v1.
