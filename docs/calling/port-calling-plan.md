# Build the calling feature into the serverless WarmChats backend

## Context

WarmChats runs on Cloudflare Pages Functions + D1, with a sidecar Worker
(`warmchats-calling-gateway`) hosting Durable Objects and a Cron Trigger. The
calling feature (web-origin outbound calls, inbound parallel-ring, missed-call
SMS) is built on top of that stack.

The design goals are one backend, one deploy, one auth surface:
1. **Full WebRTC parity** - web-origin outbound calls + SIP credential issuance.
2. **Same Pages project + sidecar Worker** for the WebSocket Durable Object.

This plan covers why the real-time calling pieces need a sidecar Worker rather
than living entirely in Pages Functions, the Cloudflare primitives that make it
possible, and the build work phase by phase.

---

## Table of contents

1. Why the calling pieces need a sidecar Worker
2. Glossary - every Cloudflare and telephony term you'll see in this plan
3. Target architecture
4. Data model
5. The `CallingGateway` Durable Object (the heart of the plan)
6. Phase 1 - Schema + shared helpers
7. Phase 2 - Auth + JWT bridge
8. Phase 3 - REST endpoints (agent surface)
9. Phase 4 - REST endpoints (admin surface)
10. Phase 5 - Telnyx provider + signature verification
11. Phase 6 - Telnyx webhooks (the three call flows)
12. Phase 7 - WebSocket gateway (Gateway DO)
13. Phase 8 - WebRTC bootstrap (`/calling/webrtc/token` + SIP credentials)
14. Phase 9 - Background jobs (webhook retry, billing-cycle rollover)
15. Phase 10 - Frontend cutover
16. Verification (end-to-end)
17. Risks and open questions
18. Out of scope

---

## 1. Why the calling pieces need a sidecar Worker

The calling feature has the following technical properties that set it apart from
plain CRUD endpoints:

- **Persistent WebSocket gateway** - browsers stay connected for the entire
  session; the server pushes `incoming_call`, `call_state`, `call_taken_elsewhere`,
  `missed_while_busy` events whenever Telnyx webhook events fire. This is **not** a
  request/response API - it's a long-lived bidirectional channel.

- **Real-time call orchestration** - the inbound flow does, within a single
  webhook turn: answer the inbound leg -> dial two outbound forks (cell + WebRTC
  SIP) -> race them -> bridge the winner to the anchor -> hang up the loser. This
  needs a process that holds the call's Telnyx `call_control_id` in memory while
  doing several follow-up HTTPS calls, and it needs to be the **only** process
  making those decisions for a given call (so the two fork legs don't both "win").

- **Relational, transactional data model** - tables with foreign keys, unique
  constraints, and atomic compare-and-swap claims (e.g. `answered_via IS NULL` is
  the condition that lets two webhook invocations race safely).

- **Webhook retries** - failed webhook events are retried at 1m / 5m / 30m via a
  scheduled sweep.

- **WebRTC plumbing** - the frontend uses `@telnyx/webrtc`, which requires a Telnyx
  **credential connection** issued per user. The backend mints a short-lived
  `loginToken` for each agent so the browser can register as a SIP endpoint without
  ever seeing the raw credentials.

These properties assume a long-lived process with WebSockets, in-memory state
during a webhook turn, and a scheduled retry queue - none of which Pages Functions
can host directly (each request runs in a fresh isolate with no WebSockets and no
cron). The sidecar Worker plus Durable Objects fill that gap; §2 onward shows how.

## 2. Glossary - every term in this plan, in plain English

These all come up below. Skim once, refer back as needed.

### Cloudflare primitives

- **Cloudflare Pages Functions** - File-based serverless functions inside a Cloudflare
  Pages project. Drop a file at `functions/api/foo.ts`, it becomes `/api/foo`. Each
  request runs in a fresh isolate; **no persistent state between requests, no
  WebSockets, no cron**. This is what 95% of WarmChats backend uses today.

- **Cloudflare Workers** - The same V8 isolate runtime as Pages Functions but
  deployed as a standalone unit (not coupled to a Pages site). Workers can host
  **WebSockets, Durable Objects, Cron Triggers, Queues** - none of which Pages
  Functions can. We need a Worker as a sidecar for the calling pieces that Pages
  Functions can't do.

- **Durable Object (DO)** - A single, globally-unique, stateful actor that
  Cloudflare guarantees runs in only one location at a time. Think of it as a
  tiny in-memory server you can address by an id. Each DO has:
  - Its own private SQLite/KV-style storage (`state.storage`).
  - The ability to hold WebSocket connections open across requests.
  - A single-writer guarantee, which is what makes the fork-leg race resolvable.

  We will have **one DO per WarmChats user** (`idFromName("user:<userId>")`) so the
  user's WebSocket pushes go through a stable address. We may also have a DO per
  active call to serialize the fork-leg race for that call.

- **DO Hibernation API** - DOs can sleep when idle (saving cost / not running
  forever). The hibernation API (`ctx.acceptWebSocket(ws)`,
  `setWebSocketAutoResponse('ping','pong')`, `serializeAttachment(...)`,
  `webSocketMessage()` / `webSocketClose()` handler methods) lets a DO keep
  WebSocket connections registered while it sleeps and wake up only when a
  message actually arrives. This is what `applimor`'s
  `WebSocketHibernationServer` uses (`s2s/index.ts:45-161`).

- **D1** - Cloudflare's serverless SQLite. We already use it. Limits matter for
  this plan: no `SERIAL` (use `INTEGER PRIMARY KEY`), no `JSONB` (use `TEXT`), no
  row-level locking - instead we serialize with `INSERT OR IGNORE` on unique
  constraints, or use a DO as the single writer.

- **KV** - Eventually-consistent key/value store. **Not used in this plan.**
  KV is capped at 1,000 writes/day per namespace on the free tier and is
  eventually-consistent on reads (up to 60 seconds of staleness). That rules
  it out for rate-limit counters, webhook dedupe, OAuth state, or anything
  else with non-trivial write volume or read-after-write needs. We use **D1
  with `INSERT OR IGNORE` on unique constraints** for webhook dedupe (see
  §11), and **Durable Object `state.storage`** for any per-call or per-user
  transient state that needs strong consistency.

- **R2** - Cloudflare's S3-compatible object store. Needed only if you want
  **call recording** storage (out of scope for v1 per current product behaviour).

- **Cron Triggers** - A Worker can subscribe to a cron schedule (e.g. every
  minute). The Worker is invoked with no HTTP request - its `scheduled()` handler
  runs. This drives the webhook-retry scheduler and billing-cycle sweep.

- **Service binding** - A Worker / Pages project can declare another Worker as a
  binding (e.g. `[[services]] binding = "GATEWAY"`). Calls become free, low-latency
  RPC instead of public HTTPS. We'll use one of these so Pages Functions can poke
  the gateway Worker.

### Telephony / call-flow terms

- **PSTN** - Public Switched Telephone Network. The "phone-call" path that ends at
  someone's actual cell. Telnyx is on the PSTN side of the call.

- **SIP** (Session Initiation Protocol) - How softphones (and browsers, via
  WebRTC) "ring" each other over the Internet. A SIP URI looks like
  `sip:agent_42@sip.telnyx.com`.

- **WebRTC** - Browser API for real-time audio/video, peer-to-peer (or browser ->
  media server). The browser does the audio with the user's mic/speakers; the
  signaling that "rings" the call goes through Telnyx as SIP. The browser library
  `@telnyx/webrtc` wraps all this.

- **Telnyx Call Control** - REST API where you don't just "place a call" - you
  manage every step of a live call (answer, transfer, bridge, hangup, speak,
  play audio) via `POST /v2/calls/{call_control_id}/actions/{action}`. Each live
  call has a `call_control_id` that you'll see referenced everywhere.

- **Telnyx Credential Connection** - A SIP credential issued to a single user
  that lets their browser register as a SIP endpoint with Telnyx. When the
  browser does `client.newCall({...})`, that call is placed via this credential.
  Backend mints a short-lived login token for the browser; the raw username/
  password never leaves the backend.

- **Anchor leg** - The original inbound call leg from the customer to your
  Telnyx number. Stays open while we ring the agent.

- **Fork leg** - A new outbound call leg dialed *from* Telnyx *to* the agent.
  We dial two: one to their cell (PSTN), one to their browser (SIP via WebRTC).
  Whichever answers first wins.

- **Bridge** - Telnyx call-control action that audio-connects two legs (the
  anchor leg + the winning fork leg).

- **10DLC** - The U.S. carrier-mandated registration scheme for application-to-
  person SMS. Not part of calling.

- **Ed25519 signature** - How Telnyx signs webhooks. Different from HMAC (Stripe).
  Header `telnyx-signature-ed25519` is a base64 detached signature over
  `{timestamp}|{rawBody}`. We verify with `tweetnacl`'s WebAssembly-free
  signature checker (small enough for Workers).

### Application/architecture terms

- **CQRS** (Command Query Responsibility Segregation) - A pattern where writes
  ("commands") and reads ("queries") use separate code paths. We deliberately
  **don't** use this in the serverless build - each command is just a function
  call inside a route handler. CQRS is useful for a long-lived monolith; it's
  overhead for individual stateless functions.

- **Idempotency** - Same event delivered twice produces the same final state.
  Achieved via unique constraints (`WebhookLog.providerEventId` is the cleanest
  one) or by writing final-state UPDATEs that are safe to run twice. Critical
  because Telnyx will retry webhooks.

- **CAS** (Compare-And-Swap) - "Update row X only if column Y is still null."
  Used here to claim the fork-leg winner atomically. In D1: `UPDATE ... WHERE
  ... AND answered_via IS NULL` and check `.meta.changes === 1`.

---

## 3. Target architecture

```
                            ┌─────────────────────────────────────┐
                            │   Cloudflare Pages: warmchats       │
                            │                                     │
   Browser ──── HTTPS ──────┤ /api/calling/**     (REST)          │
                            │ /api/admin/calling/** (REST)        │
                            │ /api/webhooks/calling/telnyx/*      │
                            │ /api/calling/ws42  ── upgrades WS to ─┼──┐
                            │                                     │  │
                            │ D1 binding (shared with main app)   │  │
                            └─────────────────────────────────────┘  │
                                          │                          │
                                          │ service binding          │
                                          ▼                          │
                            ┌─────────────────────────────────────┐  │
                            │   Cloudflare Worker:                │  │
                            │   warmchats-calling-gateway         │  │
                            │                                     │  │
                            │   Durable Objects:                  │  │
                            │     UserSocketDO  (1 per user)  ◄───┼──┘
                            │     CallActorDO   (1 per live call) │
                            │                                     │
                            │   Cron Trigger (* * * * *)          │
                            │     - webhook retry sweep           │
                            │     - billing-cycle rollover (daily)│
                            └─────────────────────────────────────┘
                                          │
                                          ▼
                                ┌──────────────────┐
                                │   Telnyx Cloud   │
                                │   (Call Control, │
                                │    WebRTC SIP,   │
                                │    SMS)          │
                                └──────────────────┘
```

Why this shape:
- **Pages project** keeps all HTTP REST handlers + the WS-upgrade entry point.
  Same auth surface, same `requireUser()` middleware, same `Env`/`D1DB` binding.
- **Sidecar Worker** hosts the two DO classes and the cron handler - both are
  features Pages Functions doesn't expose.
- **Service binding** (Pages -> Worker) means Pages Functions can call into the
  Worker without round-tripping public HTTPS. The DO is addressed via the
  service binding's RPC interface.
- **Telnyx webhooks hit Pages Functions** (`/api/webhooks/calling/telnyx/*`).
  Pages Function persists the event row to D1 (idempotency), then forwards the
  decoded event to the Worker via service binding so the DO can run the live
  orchestration.

This is exactly the shape `D:\Projects\applimor` uses:
- `wrangler.toml` (the Pages project) - `[[durable_objects.bindings]] script_name =
  "websocket-server-s2s"` and `[[services]] binding = "WEBSOCKET_SERVICE" service =
  "websocket-server-s2s"`.
- `s2s/index.ts` (the sidecar Worker) - the actual DO class
  `WebSocketHibernationServer` plus its own `wrangler.toml`
  (`D:\Projects\applimor\websocket-s2s.toml`).
- `functions/api/websocket-do.ts` - the Pages Function that does
  `env.WEBSOCKET_HIBERNATION_SERVER.idFromName(...).get(...).fetch(request)` to
  proxy the upgrade.

## 4. Data model

10 tables in D1. We add them in a new `sql/11.create-calling.sql`
file (numbered after the existing 10 schema files; `pnpm db` picks it up
automatically). Type rules already in use:

- UUID id -> `TEXT PRIMARY KEY` (we keep UUIDs as strings;
  cheap, avoids cross-table id collisions with the main app's `INTEGER` ids).
- timestamp -> `TEXT` (ISO-8601 strings, same as the rest of the schema).
- JSON -> `TEXT` (parsed/stringified at the call site).
- decimal -> `REAL` (D1 doesn't have a true decimal; usage minutes/cost don't
  need exactness beyond 6dp).
- enum -> `TEXT CHECK (col IN (...))`.
- unique -> `UNIQUE`, index -> `CREATE INDEX IF NOT EXISTS ...`.

Tables to add (mapping shown for the cross-app columns that need attention):

| Calling table                  | Notes                                                           |
| ------------------------------ | --------------------------------------------------------------- |
| `phone_numbers`                | Renames `assignedToUser` FK -> `assigned_to_user_id`. Status enum check. |
| `calls`                        | `agent_id` -> references `"user"`(`id`) (integer in WarmChats). UUID PK kept. |
| `call_events`                  | `payload TEXT` (stringified JSON). `provider_event_id UNIQUE`. |
| `billing_cycles`               | `start_date`/`end_date` as ISO strings.                         |
| `usage_records`                | `minutes REAL`, `cost REAL`, `is_overage INTEGER CHECK IN (0,1)`. |
| `calling_configurations`       | One row per org. Default ring_timeout=25, ring_strategy='parallel'. |
| `webhook_logs`                 | `status TEXT CHECK IN (...)`, `retry_count INTEGER DEFAULT 0`. |
| `calling_workspaces`           | **Not added** - we map `workspaceId` -> `organization.id` (the existing WarmChats org). One less table. |
| `users` (calling-side)         | **Not added** - map to existing `"user"`. Add columns to `"user"`: `telnyx_credential_id TEXT`, `telnyx_sip_uri TEXT` (in `sql/12.alter-user-calling.sql`). |
| `leads` (calling-side)         | **Not added** - map `leadId` -> existing `lead.id`. |

Net: 7 new tables + 2 columns added to `"user"`. We deliberately **don't** create
separate workspace/user/lead tables since the WarmChats main schema already owns
those. The calling feature's data sits *next to* the existing tables.

Drop-order updates in `sql/0.drop-tables.sql` so `pnpm db` can reset cleanly.

## 5. The `CallingGateway` Durable Object (the heart of the plan)

We need **two DO classes** in the sidecar Worker. Splitting them keeps each
single-writer guarantee meaningful.

### 5.1 `UserSocketDO` - 1 per WarmChats user

Holds the user's open WebSocket(s) - they might have multiple tabs.
Addressable as `env.USER_SOCKET.idFromName("user:" + userId)`.

Methods (exposed via `fetch()` interface):

- `GET /` with `Upgrade: websocket` - Accept a new WS for this user. Auth: the
  Pages Function that proxies the upgrade verifies the JWT *first* and passes
  `userId` in a header (`x-wc-user-id`); the DO trusts it because it's only
  reachable via service binding (private). Uses hibernation API:
  `state.acceptWebSocket(ws)`, `setWebSocketAutoResponse('ping','pong')`,
  serialize the `{ socketId, userId, orgId }` attachment so it survives
  hibernation. Mirrors `applimor s2s/index.ts:50-92`.
- `POST /emit` with JSON body `{ event, data }` - Broadcast to every WS this DO
  holds. Same pattern as `applimor s2s/index.ts:95-114`.
- `webSocketMessage(ws, message)` - Handle client -> server messages. Currently
  only `ping` (the calling-gateway client never sends anything else per
  `src/context/CallingContext.tsx`).
- `webSocketClose(ws, code, reason, wasClean)` - Drop from session map.

How other code reaches it:
- Pages Function (webhook turn) -> service binding `env.GATEWAY.fetch(...)` with
  `Host: user-socket/user:<userId>/emit` -> the gateway Worker routes to the DO
  and calls its `fetch()` -> the DO broadcasts.

### 5.2 `CallActorDO` - 1 per live call

Addressable as `env.CALL_ACTOR.idFromName("call:" + callId)`. Created on call
initiation; deleted (lets itself idle out) when the call reaches a terminal status.

Why this DO exists: the fork-leg race needs a **single decision-maker**. A
relational DB with row-level locking would solve this with an atomic
`UPDATE ... WHERE answered_via IS NULL` - but D1 doesn't have row locks, and
racing the same UPDATE across two Pages Function invocations is fragile. Pinning
all decisions for a given call to one DO sidesteps the race entirely. The DO's
storage is the call's authoritative in-flight state; D1 is the durable log.

Methods (all called via service binding from the Pages webhook handler):

- `POST /onIncoming` - body `{ payload }` - runs the inbound routing flow:
  decide busy-on-busy, answer the anchor, dial the two fork legs, persist
  `web_leg_sid` / `phone_leg_sid` to D1.
- `POST /onAnswered` - body `{ payload, callControlId }` - fork-leg winner /
  outbound bridge. Runs the atomic claim *in DO storage* (e.g.
  `state.storage.transaction(...)`) and then issues the bridge command.
- `POST /onHangup` - body `{ payload }` - call-completion logic:
  mark call terminal, write the usage record, queue missed-call SMS if applicable,
  emit `call_state` to the agent's `UserSocketDO`.
- `POST /onWebOutbound` - body `{ payload, callControlId }` - registers a
  web-origin call: finds agent by SIP origin, upserts lead by destination,
  attaches `call_control_id` to the placeholder Call row created by the outbound API.

DO storage holds: `{ callId, anchorCallControlId, webLegSid, phoneLegSid,
answeredVia, stage }`. Storage writes are transactional; the `answeredVia` claim
is a simple `if (existing.answeredVia == null) { put({ answeredVia: winner }); }`.

After a terminal event, the DO writes one last row to D1, closes any sockets it
holds (none, by design - broadcast goes through `UserSocketDO`), and exits.
Cloudflare reclaims idle DO instances automatically.

---

## 6. Phase 1 - Schema + shared helpers

**Files to create:**
- `sql/11.create-calling.sql` - the 7 new tables (per §4).
- `sql/12.alter-user-calling.sql` - `ALTER TABLE "user" ADD COLUMN telnyx_credential_id TEXT;` + `telnyx_sip_uri TEXT`.
- Extend `sql/0.drop-tables.sql` with the 7 new tables in reverse-FK order.
- `functions/_shared/callingAccess.ts` - `requireCallingMember(env, user, callId | leadId | phoneNumberId)`. Pattern after `functions/_shared/orgAccess.ts`.

**Files to modify:**
- `functions/_shared/env.ts` - add Telnyx voice envs (`TELNYX_CONNECTION_ID`,
  `TELNYX_CREDENTIAL_CONNECTION_ID`, `TELNYX_MESSAGING_PROFILE_ID`,
  `TELNYX_SIP_DOMAIN`) and the DO + service bindings:
  ```ts
  USER_SOCKET: DurableObjectNamespace;
  CALL_ACTOR: DurableObjectNamespace;
  GATEWAY: Fetcher;          // service binding to the sidecar worker
  ```
- `wrangler.toml` - `[[durable_objects.bindings]]` blocks (with `script_name`
  pointing at the sidecar Worker name) + `[[services]]` block + the 4 new envs.

**Verification:** `pnpm db` applies all SQL cleanly local + remote.
`npx tsc -p tsconfig.functions.json --noEmit` clean.

## 7. Phase 2 - Auth + JWT bridge

In our serverless backend the access token rides as an **HttpOnly cookie**, the
same surface the main API uses. The calling frontend must use that cookie for
both the REST calls and the WebSocket handshake rather than an
`Authorization: Bearer` header.

**Approach:**
- Update `src/api/calling.ts` so the axios instance uses
  `withCredentials: true` (same cookie surface as the main API) instead of
  `Authorization: Bearer <localStorage.token>`.
- Update the WebSocket client at `src/context/CallingContext.tsx:295-301` -
  instead of passing a token in the handshake, let the browser send the
  `access_token` cookie. The DO upgrade route on our side reads it from
  `request.headers.get('cookie')` using the existing `readCookie()` helper.
- The Pages Function that proxies the WS upgrade does the JWT verification
  before handing off to the DO. Verified user-id goes in an `x-wc-user-id`
  header on the DO `fetch()` call. The DO never sees the JWT.

**Files:**
- Modify `src/api/calling.ts` (drop the Authorization interceptor, set
  `withCredentials: true`).
- Modify `src/context/CallingContext.tsx` (drop the handshake token; the cookie
  rides along on the WS handshake automatically since both endpoints share the
  origin or are CORS-allowed).
- New `functions/api/calling/ws42.ts` - Pages Function: verify the cookie via
  `requireUser()`, then proxy upgrade to `env.GATEWAY.fetch(...)`.

## 8. Phase 3 - REST endpoints (agent surface)

7 endpoints. Each is a Pages Function under `functions/api/calling/**`. Each
follows the existing pattern: `requireUser(env, request)` -> check membership
via `requireCallingMember()` -> run business logic -> `return json(...)`.

| Route                                  | File                                              | Purpose                                              |
|----------------------------------------|---------------------------------------------------|------------------------------------------------------|
| `POST /api/calling/calls/outbound`     | `functions/api/calling/calls/outbound.ts`         | Initiate an outbound call                            |
| `GET /api/calling/calls/[callId]`      | `functions/api/calling/calls/[callId].ts`         | Get a call by id                                     |
| `GET /api/calling/calls/by-phone/[phoneNumber]` | `functions/api/calling/calls/by-phone/[phoneNumber].ts` | Filter calls by phone number                         |
| `GET /api/calling/leads/[leadId]/calls`| `functions/api/calling/leads/[leadId]/calls.ts`   | List a lead's calls                                  |
| `GET /api/calling/usage/workspace`     | `functions/api/calling/usage/workspace.ts`        | Usage stats for the org                              |
| `GET /api/calling/analytics/dashboard` | `functions/api/calling/analytics/dashboard.ts`    | Call dashboard stats                                 |
| `GET /api/calling/can-call`            | `functions/api/calling/can-call.ts`               | Whether the user may place a call                    |

For the outbound endpoint: when `origin === "phone"` we tell Telnyx to dial the
agent's cell (the existing flow); when `origin === "web"` we just create a
placeholder Call row with `provider_call_sid = "pending-web-<callId>"` and
return `{ callId }` - the actual Telnyx call_control_id gets attached later by
`CallActorDO.onWebOutbound` when the WebRTC SDK's `call.initiated` webhook
arrives.

## 9. Phase 4 - REST endpoints (admin surface)

11 endpoints under `functions/api/admin/calling/**`. Same pattern; gate on
role (existing `roleRequired` helper if it's there, else a manual check that
the user's `role_name` is `Owner` or `Manager`).

Notable ones:
- `POST /admin/calling/phone-numbers` - calls `provider.provisionNumber()` (two
  Telnyx calls: search available, then place order). Persists `phone_numbers`
  row. Big enough to deserve its own helper in
  `functions/_shared/telnyx/provision.ts`.
- `GET /admin/calling/agents/web-status` - joins `"user"`, `phone_numbers`, and
  hits `USER_SOCKET.idFromName(...).fetch('/status')` on each user to learn
  whether they have an open WS. (Adds a `/status` route to the DO that returns
  `{ online: boolean, count }`.)
- `POST /admin/calling/webhooks/[id]/retry` - re-runs the webhook through the
  same code path the cron retry uses (see Phase 9).

## 10. Phase 5 - Telnyx provider + signature verification

The Telnyx provider lives in `functions/_shared/telnyx/client.ts`. Methods:
- `dial(...)`, `executeCallControl(...)`, `bridge(...)`, `hangup(...)`,
  `sendSms(...)`, `provisionNumber(...)`, `createCredentialConnection(...)`,
  `createOnTheFlyToken(...)`.

All are thin REST wrappers (`POST /v2/calls`, `POST
/v2/calls/{id}/actions/{action}`, etc.) - same pattern as our existing
`functions/_shared/stripe.ts`. No Node SDK; pure `fetch`.

Signature verification (Ed25519) goes in `functions/_shared/telnyx/verify.ts`:

```ts
import nacl from "tweetnacl"; // tiny, Workers-compatible, no native code
export async function verifyTelnyxSignature(env, rawBody, headers) {
  const sig = headers["telnyx-signature-ed25519"];
  const ts  = headers["telnyx-timestamp"];
  if (!sig || !ts) return false;
  if (Math.abs(Date.now()/1000 - Number(ts)) > 300) return false;
  const pub = Buffer.from(env.TELNYX_PUBLIC_KEY, "base64");
  const sigBytes = Buffer.from(sig, "base64");
  const msg = new TextEncoder().encode(`${ts}|${rawBody}`);
  return nacl.sign.detached.verify(msg, sigBytes, pub);
}
```

(Note: replace `Buffer` with `Uint8Array` + `atob` for Workers if `nodejs_compat`
flag isn't set; the maths is the same.)

## 11. Phase 6 - Telnyx webhooks (the three call flows)

Three Pages Functions under `functions/api/webhooks/calling/telnyx/`:

- `status.ts` - `POST /webhooks/calling/telnyx/status` - Telnyx Call Control
  events. After signature verification and `webhook_logs` insertion (unique on
  `provider_event_id` for idempotency), it forwards to the appropriate
  `CallActorDO` method via service binding:
  - `call.initiated` + `direction=incoming` -> `CallActorDO.onIncoming`
  - `call.initiated` + `direction=outgoing` + SIP origin -> `CallActorDO.onWebOutbound`
  - `call.answered` + fork-leg state -> `CallActorDO.onAnswered` (fork winner)
  - `call.answered` + outgoing (agent-first PSTN) -> `CallActorDO.onAnswered` (bridge)
  - `call.hangup` -> `CallActorDO.onHangup`
- `inbound.ts` - `POST /webhooks/calling/telnyx/inbound` - inbound call hook.
  Calls `CallActorDO.onIncoming`.
- `sms.ts` - `POST /webhooks/calling/telnyx/sms` - stub (returns 200); the
  WarmChats main SMS webhook is already at `/webhooks/telnyx/inbound`. We keep this here only because today's frontend doesn't
  configure it - and a Telnyx app can't emit-or-fail without a registered URL.

Each handler:
1. Read raw body as text.
2. Verify Ed25519 signature.
3. Compute `provider_event_id` (Telnyx provides one). `INSERT OR IGNORE INTO
   webhook_logs (...)`. If `.meta.changes === 0` -> already seen -> return 200.
4. Dispatch to the right `CallActorDO` method.
5. Return 200 on success; on processing error, **still return 200** and mark
   the log row `FAILED` - cron retry sweeps will pick it up. Returning non-200
   would cause Telnyx to retry on its own and we'd duplicate retries.

## 12. Phase 7 - WebSocket gateway (Gateway DO)

This is the bit that **only works because we have a sidecar Worker**.

The frontend uses a raw `WebSocket` client (`src/context/CallingContext.tsx`)
that handles the same event shapes the UI needs:

- `incoming_call`, `call_state`, `call_taken_elsewhere`, `missed_while_busy`.

The wire format: every message is `JSON.stringify({ event, data })`. The client
shim is ~30 lines, exposing a small `.on(...)` API so the rest of the UI doesn't
change.

**Server side** (sidecar Worker, `src/index.ts` of the gateway-worker):

```ts
export { UserSocketDO } from "./userSocket.do";
export { CallActorDO } from "./callActor.do";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Routing scheme: /do/<class>/<name>/<method>
    // Pages Function calls env.GATEWAY.fetch(new Request(
    //   "http://gw/do/userSocket/user:42/emit", { method:'POST', body:JSON.stringify(...) }
    // ))
    const [, kind, className, name, ...rest] = url.pathname.split("/");
    const path = "/" + rest.join("/");
    if (kind !== "do") return new Response("Not found", { status: 404 });

    const ns = className === "userSocket" ? env.USER_SOCKET
             : className === "callActor"  ? env.CALL_ACTOR
             : null;
    if (!ns) return new Response("Unknown DO class", { status: 404 });

    const id = ns.idFromName(name);
    const stub = ns.get(id);
    return stub.fetch(new Request("http://do" + path, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    }));
  },

  async scheduled(_ctrl, env) { /* cron sweep - Phase 9 */ },
};
```

**Frontend side**:
- A tiny WS shim (`src/utils/wsClient.ts`) exposes `.on(event, cb)`,
  `.emit(event, data)`, `.disconnect()`, and reconnect-with-backoff, so
  `CallingContext.tsx` needs minimal edits.

Auth on the upgrade: cookie-based (see Phase 2). The DO trusts the
`x-wc-user-id` header the proxying Pages Function added.

## 13. Phase 8 - WebRTC bootstrap (`/calling/webrtc/token` + SIP credentials)

This is the part most often missed. WebRTC outbound from the browser works
because:
1. Each agent has a **Telnyx credential connection** (a SIP credential).
2. The browser doesn't see the credential directly - it gets a short-lived
   `loginToken` (Telnyx feature: "on-the-fly login token") that lets the
   `@telnyx/webrtc` SDK register as that SIP endpoint for ~30 minutes.
3. The frontend calls `POST /api/calling/webrtc/token`; backend looks up
   `user.telnyx_credential_id`, creates one if absent (`POST /v2/credential_connections`,
   then provisions a SIP username derived from the user id), then mints a login
   token (`POST /v2/telephony_credentials/{id}/token`).

Files:
- `functions/api/calling/webrtc/token.ts` - the endpoint.
- Helpers in `functions/_shared/telnyx/credentials.ts`:
  - `ensureCredentialConnection(env, userId): Promise<{ credentialId, sipUri }>`
  - `createLoginToken(env, credentialId, ttlSecs): Promise<{ loginToken, expiresAt }>`

On first call we also write `telnyx_credential_id` + `telnyx_sip_uri` back to
the `"user"` row (Phase 1's added columns). Subsequent calls reuse them.

## 14. Phase 9 - Background jobs (webhook retry, billing-cycle rollover)

Sidecar Worker's `scheduled()` handler runs every minute via Cron Trigger.
In its `wrangler.toml`:
```toml
[triggers]
crons = ["* * * * *"]
```

The handler:
1. Query D1 for `webhook_logs WHERE status IN ('FAILED','RETRYING') AND
   next_retry_at <= NOW() LIMIT 50`.
2. For each row, replay through `processWebhookEvent(...)` (same function the
   `/webhooks/calling/telnyx/status` route calls).
3. Bump `retry_count`, update `last_retry_at`, push `next_retry_at` further
   out (1m -> 5m -> 30m -> marked permanent failure at retry 4).

Daily at 00:00 UTC (`crons = ["0 0 * * *", "* * * * *"]`) also sweep
`billing_cycles WHERE end_date < NOW() AND status = 'ACTIVE'` -> set
`status='COMPLETED'`; create the next active cycle for each workspace.

## 15. Phase 10 - Frontend cutover

When all the above is built and verified end-to-end:

1. Update `.env`, `.env.development`:
   ```
   VITE_CALLING_API_BASE=/api
   VITE_CALLING_WS_URL=wss://www.warmchats.com/api/calling/ws42
   ```
2. Delete the `Authorization: Bearer` interceptor in `src/api/calling.ts`,
   switch to `withCredentials: true`.
3. Point `src/context/CallingContext.tsx` at the WS shim.
4. Ensure the `VITE_CALLING_*` values point at the in-project
   `/api/calling/**` endpoints and the gateway WS URL.
5. Deploy.

---

## 16. Verification (end-to-end)

For each phase the local verification is:
- `pnpm db` clean (apply schema).
- `npx tsc -p tsconfig.functions.json --noEmit` clean.
- `pnpm dev` plus, for the sidecar Worker, `wrangler dev` in the gateway-worker
  folder with `--persist` so the DOs survive restarts.

For each call flow, integration test with Telnyx's CLI or real numbers:
1. **Outbound PSTN** - call `POST /api/calling/calls/outbound` with
   `origin: "phone"`. Agent's cell rings. Answering bridges to the customer
   number. `call_state` events received in the UI in real time. `call_events`
   + `usage_records` rows persisted in D1.
2. **Outbound WebRTC** - same endpoint with `origin: "web"`. Browser places
   call via Telnyx SDK. The webhook arrives and `CallActorDO.onWebOutbound`
   attaches the real `call_control_id` to the placeholder row. `call_state`
   events flow through the DO -> WS -> UI.
3. **Inbound parallel-ring** - a real call to the business number. Telnyx
   fires `call.initiated`. The webhook routes to `CallActorDO.onIncoming`.
   Two fork legs ring. Browser modal shows the incoming call (via
   `UserSocketDO.emit('incoming_call', ...)`). Answer on the browser ->
   bridge happens, the cell stops ringing, `call_taken_elsewhere` reaches
   any other open tab. Same flow but answer on the cell -> web call drops.
4. **Missed call** - let it ring out. `call.hangup` arrives.
   `CallActorDO.onHangup` runs `CompleteCallHandler` equivalent: writes a
   `usage_record` with `minutes=0`, sends the missed-call SMS via Telnyx
   Messaging API, emits `missed_while_busy` to the agent's WS.
5. **Webhook retry** - temporarily break the DO method to throw on a specific
   event. Verify the `webhook_logs` row is marked `FAILED`, the cron sweep
   retries it in 1m, succeeds.
6. **Idempotency** - `stripe trigger`-equivalent (Telnyx has a
   `telnyx webhook trigger` CLI or you can replay events from the Mission
   Control logs). Send the same event twice. Verify `INSERT OR IGNORE` makes
   the second one a no-op.

`tsc -p tsconfig.functions.json` clean across all phases.

## 17. Risks and open questions

- **Telnyx credential connection lifecycle.** Free vs paid accounts, regional
  limits, what happens when an agent is deleted. We need to add a cleanup
  path in the Phase-10 user-delete handler (or document that the SIP credential
  becomes orphaned).
- **DO billing.** DOs are billed per request + GB-second of wall-time. With
  hibernation enabled (Phase 7), wall-time goes to ~0 between events; per-request
  cost is fractions of a cent. Real exposure is the WS-connected-time. For
  ~100 agents holding sockets all day that's small but not zero - back-of-envelope
  ~$5-15/month at current Cloudflare pricing.
- **Service binding from Pages.** Service bindings between a Pages project and a
  separate Worker work, but only via Cloudflare's binding API at deploy time;
  you can't test it identically with `wrangler pages dev` if the sidecar isn't
  also up. Local dev story: run `wrangler dev` for the sidecar Worker and
  `pnpm dev` for Pages with `--port` config so they share a host.
- **Recording.** Telnyx call recording is a separate feature (
  `record-call-action` on `executeCallControl`). The calling feature doesn't
  use it in v1. R2 would be needed if/when we add it.
- **10DLC bond on the calling SMS path.** The missed-call SMS flow uses the
  same Telnyx messaging profile we already configured for the main SMS path
  (Master Campaign). No extra registration needed.
- **Browser audio permissions.** WebRTC requires the user to grant mic access
  on the first call. Frontend already handles this in `CallingContext.tsx`.
  No backend change needed.
- **Frontend env wiring.** The calling frontend must point at the in-project
  `/api/calling/**` endpoints and the gateway WS URL; verify there are no stale
  external base URLs in the `VITE_CALLING_*` env before deploy.

## 18. Out of scope

- Call **recording** + R2 bucket integration. Can add later.
- **Call transcription** / AI summaries on recordings.
- **Conference / multi-party** calls. v1 only does 1:1.
- **Phone number porting** from another provider. Provisioning new Telnyx
  numbers only.
- **Migration of historical call data.** v1 starts with a clean call log.
  (A one-shot import could be added later if call history is
  regulatory-required.)
