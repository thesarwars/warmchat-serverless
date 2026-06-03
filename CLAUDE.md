# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> This file (`CLAUDE.md`) is the single authoritative, continuously-maintained source of truth for orientation, conventions, compliance rules, and outstanding work - the former root `README.md` has been merged into it (everything below the orientation). **Compliance is the top priority of this project.**

## What this is

A Cloudflare-hosted real-estate lead follow-up platform (SMS / MMS / email / voice). Four deployable pieces share one D1 database:

| Piece | Location | Deploy | Purpose |
| ----- | -------- | ------ | ------- |
| SPA frontend | `src/` (Vite + React 19) | `pnpm upload` | Dashboard, inbox, onboarding |
| Backend API | `functions/api/**` (Pages Functions) | `pnpm upload` (same deploy) | REST endpoints; one file = one route |
| Calling/realtime gateway | `gateway-worker/` (separate Worker) | `pnpm upload-ws` | WebSocket notifications, WebRTC calling, Durable Objects, AND its own cron for the call AI pipeline |
| Cron dispatcher | `workers/cron/` (separate Worker) | `pnpm upload-cron` | Scheduled-message / sequence dispatch, Gmail token refresh (Pages Functions can't register cron triggers) |

## Common commands

```
pnpm dev-ws       # 1. Gateway/websocket worker (:8789) - start FIRST
pnpm dev          # 2. Frontend on :5173, proxies /api -> :8443 (runs Pages Functions in-process)
pnpm dev-cron     # 3. Cron worker (:8788) with --test-scheduled
pnpm cron:trigger # fire one cron tick on demand

pnpm db-fast           # reset + reseed LOCAL D1 (runs sql/*.sql in numeric order)
pnpm db-fast-remote    # same against REMOTE D1 (y/n prompt) - the user tests on remote
pnpm mock:logs    # tail mock_send_log (MOCK_SEND_APIS=1 routes all sends here)

pnpm lint            # ESLint (0 warnings) + tsc -b + knip + depcheck -> errors-*.log. Keep fully green.
pnpm lint-backend    # tsc -p tsconfig.functions.json --noEmit  (functions/ + workers/ only)
pnpm lint-frontend   # tsc -p tsconfig.app.json --noEmit        (src/ only)
pnpm build           # vite build (verify build works)

pnpm upload          # lint + build + deploy frontend & backend Pages
pnpm upload-ws       # deploy gateway worker
pnpm upload-cron    # deploy cron worker
pnpm realtime-logs   # wrangler pages deployment tail (Pages can't enable observability)
```

There is no test runner - `lint` (typecheck + ESLint + unused detection) is the gate. Do NOT use bare `tsc --noEmit`: the root tsconfig has empty `files` and exits 0 even with errors in referenced projects. Use `pnpm lint` or `tsc -b`.

## Quick start

```
# 0) One-time: reset + seed the LOCAL D1 (PowerShell)
pnpm db-fast

# 1) Gateway / websocket worker - The calling server and notifications web socket
pnpm dev-ws

# 2) Frontend (Vite on :5173, proxies /api -> :8443)
pnpm dev

# 3) The cron worker (your question) - boots on :8788 with --test-scheduled
pnpm dev-cron

# You fire a tick on demand:
pnpm cron:trigger

warmchats-calling-gateway: http://127.0.0.1:8789/cdn-cgi/explorer/
warmchats: http://127.0.0.1:3333/cdn-cgi/explorer/
warmchats-cron: http://127.0.0.1:8788/cdn-cgi/explorer/
```

## Scripts

```
# 1. Start the websocket server first (wrangler dev --config gateway-worker/wrangler.toml)
pnpm dev-ws

# 2. Start the frontend + backend (vite) [Both the websocket and the dev needs to run at the same time]
pnpm dev

# 16. Run the cron worker locally (wrangler dev --config workers/cron/wrangler.toml --test-scheduled)
pnpm dev-cron

# 17. Fire the cron scheduler one-shot against the local cron dev server
pnpm cron:trigger

# 18. Run the WebRTC gateway worker locally on its own port
pnpm gateway:dev

# 19. Tail the most recent mock_send_log entries from the local D1 (works when MOCK_SEND_APIS=1)
pnpm mock:logs

# 3. Test if build works (vite build)
pnpm build

# 4. Lint, Build & upload frontend + backend to Cloudflare (pnpm build && wrangler pages deploy dist)
pnpm upload

# 5. Upload the websocket server (wrangler deploy --config gateway-worker/wrangler.toml)
pnpm upload-ws

# 6. Updates all the packages, make sure you close all servers first (pnpm upgrade --latest && cd gateway-worker && pnpm upgrade --latest && cd ../workers/cron && pnpm upgrade --latest && cd ..)
pnpm updater

# 7. Unused files + TypeScript + ESLint (tsx scripts/lint.ts)
pnpm lint

# 8. Backend functions TypeScript only (tsc -p tsconfig.functions.json --noEmit)
pnpm lint-backend

# 9. Frontend TypeScript only (tsc -p tsconfig.app.json --noEmit)
pnpm lint-frontend

# 10. Unused files + dependencies (knip + depcheck, each reported separately)
pnpm unused

# 11. Build locally with development env (vite build --mode development)
pnpm build:dev

# 12. Mount dist locally to test the build (vite preview)
pnpm preview

# 13. Reset local db and recreate + seed (wrangler d1 execute warmchats-db --file=sql\$file)
pnpm db-fast

# 14. Reset remote db with Y/N approval per run + recreate + seed (wrangler d1 execute warmchats-db --remote --file=sql\$file)
pnpm db-fast-remote

# 15. Run a single sql file on the remote db (wrangler d1 execute warmchats-db --remote --file=sql\_seed_conversations.tmp.sql)
pnpm db-remote-seed
```

# Project Structure & Constraints
- DO NOT invent, hallucinate, or assume any file names or paths.

## Architecture notes that span files

- **Pages Functions = file-based routing.** A path like `functions/api/automations/send/[automationId].ts` serves `/api/automations/send/:automationId`. Shared logic lives in `functions/_shared/**` (auth, db, the send engine, compliance guards). `workers/cron/_shared/**` is a parallel copy of the subset the cron needs - changes to send/quiet-hours/rate-limit logic often must be mirrored there.
- **Durable Objects live only in the gateway worker.** Pages Functions never instantiate DOs; they call `env.GATEWAY.fetch("http://gw/do/<class>/<name>/<method>")` (routed in `gateway-worker/src/index.ts`). `UserSocketDO` = per-user notification socket; `CallActorDO` = per-call state (it pins the "who answered first" fork-leg race because D1 has no row locks).
- **One send queue.** `scheduled_message` is the single outbound queue the cron dispatches. It's written by `queueScheduledMessage` in `functions/_shared/autoResponse.ts` - used by `advanceQualification` in `qualificationFlow.ts` (reactive inbound qualification replies) and by `queueAutomationForLead` in `automationEnroll.ts` (outbound automation drips, tagged `automation_id`). Every outbound path must run the quiet-hours guard (`quietHours.ts`) and the D1-backed per-second `sendRateLimiter.ts` - adding a send path without these is a compliance regression. Interactive blocks return HTTP 200 with `code: "QUIET_HOURS"`, not a 4xx.
  - **Dispatcher behaviour** ([workers/cron/jobs/scheduledMessages.ts](workers/cron/jobs/scheduledMessages.ts)): the cron is on the **Workers Paid** plan now (`[limits] cpu_ms` set; the two queue-drainers get a 120s `DRAIN_TIMEOUT_MS` in [index.ts](workers/cron/index.ts), not the old self-imposed 25s that aborted mid-row and stranded rows in `status='sending'` + an orphan empty conversation). Each tick: (1) **reclaims** any row stuck in `'sending'` older than `STUCK_SENDING_GRACE_SECONDS` back to `'scheduled'` (persist helpers are idempotent on contact/conversation, so the retry fills the empty conversation); (2) selects due rows **inbound-first** (`automation_id IS NULL` ordered before automation drips - a big campaign can't starve a live reactive reply); (3) **pre-resolves** the AI-gate / quiet-hours / sender-key lookups for the distinct keys in parallel, then processes rows **concurrently** (`mapPool`, `PROCESS_CONCURRENCY`) so throughput approaches the per-second caps instead of dribbling ~1/sec. `MAX_PER_TICK=100` keeps the D1 subrequest count under the per-invocation ceiling.
- **All notifications go through `notify()`** (`functions/_shared/notify.ts`): it persists, emits over the gateway WebSocket, and fans out web push, each gated by per-kind user prefs. Never insert notification rows or push directly.
- **AI is three agents** (Assistant / Inbound / Outbound) gated by three control levels (global `ai_master_enabled`, per-agent, per-lead `ai_status`), all OFF by default. Frontend in `src/components/ai-v2/`, backend in `functions/api/ai/`, prompt assembly in `functions/_shared/aiAgents.ts`. Read "AI agents" + "Outstanding work" below before touching this - much of the UI is still placeholders.
- **TypeScript is split into project references**: `tsconfig.app.json` (`src/`, DOM libs), `tsconfig.functions.json` (`functions/` + `workers/`, Workers types), `tsconfig.node.json` (build scripts). `@/` aliases `src/`.

## Hard constraints (Free-tier Workers - Error 1102 at 10ms CPU/request)

- **Never put a `_middleware.ts` at the functions root** - it forces every static asset through the Worker and 1102s. Geo-blocking and rate-limit rules live on the Cloudflare WAF, not in code.
- **No heavy per-request compute**: PBKDF2 in `functions/_shared/password.ts` is capped at 12k iterations (~8ms). No xlsx parse / high-iteration crypto on the request path.
- **Never use Cloudflare KV** (free tier caps ~1000 writes/day). Use D1 for durable per-request state.

## Conventions (full list below)

- **No emojis anywhere** - UI, code, comments, commit messages.
- ASCII punctuation only (project-wide ban) - no smart/Unicode punctuation in the repo; type - ... ' " x instead of em dash / en dash / ellipsis / curly quotes / multiplication sign (×). (The right-arrow and middle-dot glyphs are allowed.) Full mapping in the Conventions section below.
- **No stub/demo/mock data** in shipped UI - render `-` or an empty state until a real endpoint exists.
- **No redirect routes** - removed/renamed pages are deleted and references repointed; a gone page should 404 (app is pre-production). `/api/*` are backend endpoints, not routes.
- **No SQL migrations, no `ALTER`** - both local (`pnpm db-fast`) and the production D1 (`pnpm db-fast-remote`) are reset + reseeded wholesale from `sql/*.sql`. There IS a production DB, but it has no users yet, so we rebuild it rather than migrate. Fold schema changes into the existing `sql/N.create-*.sql` files (a brand-new table = a new numbered file); static seed data in `sql/100.seed.sql`.
- **Plaintext secrets in `wrangler.toml` / `.dev.vars` are intentional** (private repo). Don't flag them in reviews or suggest rotation/`secret put` migrations unless asked.
- **No external CRM integration** (HubSpot/etc. was deliberately dropped). `src/context/CRMContext.tsx` is the app's own internal naming.

---

## ServerlessWarmChats - reference handbook

THE MOST IMPORTANT THING ABOVE EVERYTHING ELSE IS COMPLIANCE!!!

The WarmChats backend on Cloudflare Pages. Frontend is Vite + React; backend lives in `functions/api/` as Pages Functions; realtime runs through a Cloudflare Worker (`gateway-worker/`); data is in D1.

You have access to local Cloudflare services (KV, R2, D1, Durable Objects, and Workflows) for this app via the Explorer API.
API endpoint: http://127.0.0.1:3333/cdn-cgi/explorer/api.
Fetch the OpenAPI schema from http://127.0.0.1:3333/cdn-cgi/explorer/api to discover available operations. Use these endpoints to list, query, and manage local resources during development.

## Project memory

Single consolidated project-knowledge footprint for **ServerlessWarmChats** (`d:\Projects\ServerlessWarmChats`); this `CLAUDE.md` is the source of truth and the `.claude` memory just points here. Stack: Cloudflare Pages (Vite SPA + `functions/api/**`) + two Workers (`warmchats-cron`, `warmchats-calling-gateway`) + D1 + R2 + Durable Objects. 

### Working preferences (apply without being asked)
- **Never use Cloudflare KV** - free tier caps writes at ~1000/day. Use D1 for durable per-request state (the project has a D1-backed `sendRateLimiter`); use a WAF rule for edge rate limiting.
- **No redirect routes.** When a page/route is removed or renamed, delete it and repoint references - never leave a `Navigate` redirect. The app is pre-production, so a removed page should 404. (API paths like `/api/ai-agent/*` are backend endpoints, not routes - leave those.)
- **Plaintext secrets in `wrangler.toml` / `.dev.vars` are intentional** (API keys, OAuth secrets, SMTP passwords, VAPID private keys, etc.) - repo and CF dashboard are both private by design. Don't flag them in audits, reviews, or "stupid stuff" surveys, and don't suggest `wrangler pages secret put` migrations or key rotation unless asked; don't add warnings about it to this file or code comments either. (Exception: if the repo ever goes public or a key surfaces in another project, raise it then.)
- **No external CRM integration.** HubSpot/Pipedrive/Salesforce sync was deliberately dropped - don't build or suggest it. (`src/context/CRMContext.tsx` is the app's own internal leads/deals naming, unrelated to external providers.)
- **Keep `pnpm lint` fully green** (ESLint 0, knip 0 unused, tsc 0).
- **Never run the dev servers yourself** (`pnpm dev`, `pnpm dev-ws`, `pnpm dev-cron`) - the user runs them. They are long-running and the user drives local/remote testing. You MAY run `pnpm lint`, `pnpm build`, `pnpm db-fast` (local reset), and read-only commands; for anything that needs a live server, give the user the exact commands to run instead.
- **The user tests on the remote deploy**, not local: code changes need `pnpm upload`; seed/default changes also need `pnpm db-fast-remote` reseed to show up.

### Operational gotchas
- **Free-tier 10ms CPU cap (Error 1102), the 2026-05-27/28 incident** - two causes: (1) a root `functions/_middleware.ts` forced every static asset through the Worker (deleted; it was only a CORS net, geo-blocking is on the WAF); (2) PBKDF2-SHA256 at 100k iterations in `functions/_shared/password.ts` (lowered to **12_000** ~8ms; drop to 10k if it returns, raise toward OWASP 600k only on Workers Paid). Iteration count is stored in each hash, so changes are backward-compatible. Early warning we missed: dashboard median CPU at 3.77ms - if it drifts up, suspect a hot per-request path. Keep provider webhook IPs whitelisted on the WAF.
- **Telnyx 10DLC number->campaign** uses `POST /v2/10dlc/phoneNumberCampaign` (camelCase `{ phoneNumber, campaignId }`); the snake_case `/v2/10dlc/phone_numbers/assignments` 404s. Campaign id is always `TELNYX_MASTER_CAMPAIGN_ID` (umbrella model - see "SMS compliance / 10DLC strategy").
- **Calls workspace lives inside the Inbox** (embedded via `?tab=`, `<CallsPage embedded />`) - no `/calls` route or sidebar item. Its AI pipeline (transcript/summary/sentiment) runs in the **gateway-worker cron**, never the Pages webhook. The gateway-worker needs an R2 `ATTACHMENTS` binding + `OPENAI_API_KEY`/`TELNYX_API_KEY` secrets (`wrangler secret put <KEY> --name warmchats-calling-gateway`) or the pipeline silently no-ops. `calls.recording_url`/`voicemail_url` store the **R2 object key**, not the Telnyx URL.
- **Local D1 is per-config-dir** - Wrangler persists miniflare state next to each config file, so the cron writes to `workers/cron/.wrangler/state` (a separate empty DB) and logs `D1_ERROR: no such table` while the app is fine. Fix (done): `pnpm dev-cron` passes `--persist-to .wrangler/state` (resolved from repo root). Never `cd workers/cron && wrangler dev`.

### References (local dev)
- **CF Explorer API** - local KV/R2/D1/DO/Workflows per worker: `warmchats` `:3333/cdn-cgi/explorer/`, `warmchats-calling-gateway` `:8789`, `warmchats-cron` `:8788`. Append `api` to a base URL for that worker's OpenAPI schema.
- **WAF rate-limit rule** (dashboard, not repo): 5 req / 10s on `/api/auth/{login,register,forgot-password,reset-password,accept-invite,resend-confirmation,google-login}`. To rate-limit a new endpoint, add its path to the rule's `in {...}` set - not in code, never via KV.

### AI restructure - 3 agents + dashboard redesign (shipped; deeper features pending)
The 3-agent AI section (Assistant/Inbound/Outbound), the AI-first **dashboard redesign**, 3-level control, AI-off-by-default, usage metering, and agent-profile prompt injection are all SHIPPED and lint-clean. Still pending: the per-workflow `WorkflowCard` UI + `ai_workflow` seed rows, the per-agent Templates/Persona/Logs tab components, the Inbound `Lead Scoring`/`Buyer AI`/`Seller AI` + Outbound builder sub-tabs (still `FeaturePanel` placeholders), and cron-side prompt integration. Full detail is in the "AI agents", "Dashboard", and "Outstanding work" sections below. Read those before touching `src/components/ai-v2`, `functions/api/ai`, or the auto-response / cron send path.

> NOTE (AI-native CRM build): the v2 AI Agent page (`src/components/ai-v2/`) is now **wired to live data** and the inbound brain is a real **LLM tool-calling agent**, not keyword routing. See the "AI-native CRM" section below for the orchestrator, availability/booking, tasks/deals/escalation, and the new schema. The old multi-page `/ai/*` layout and the `src/components/ai/` folder were **removed** - the single `/ai/agent` page is the only AI page.

## Cron jobs

The scheduled-message dispatcher, sequence dispatcher, and Gmail token refresher live in `workers/cron/` as a separate Worker (Pages Functions can't register cron triggers). Cron fires every minute - per-second provider caps are enforced in D1 by `functions/_shared/sendRateLimiter.ts`.

Local development:

1. `pnpm dev` boots the Pages app on `:5173`.
2. `pnpm dev-cron` boots the cron worker on `:8788` with `--test-scheduled` so you can manually fire it via `pnpm cron:trigger`.
3. With `MOCK_SEND_APIS=1` in `.dev.vars` (the default), every send flows through `functions/_shared/mockSendApi.ts` and lands in the `mock_send_log` D1 table. Inspect it via `pnpm mock:logs` or in the UI at `/admin/debug` (Owner role only).

Provider rate caps (defaults in `sendRateLimiter.ts`):

| Channel | Per-second cap | Sender key |
| ------- | -------------- | ---------- |
| SMS     | 49             | Telnyx 10DLC phone number |
| MMS     | 14             | Telnyx 10DLC phone number |
| Email   | 10             | Sending domain (ElasticEmail) |

The `/admin/debug` page shows the peak per-second send count for the visible window so you can confirm the rate limiter is doing its job.

## Conventions

- **No emojis** - anywhere. UI text, code, comments, commit messages. Strip them even when adapting designs that include them.
- **ASCII punctuation only (project-wide ban)** - never use smart/Unicode punctuation ANYWHERE in the repo (UI copy, code, comments, commit messages, docs, SQL/seed strings). Always type the ASCII form: em dash (U+2014) -> `-`, en dash (U+2013) -> `-`, ellipsis (U+2026) -> `...`, curly single quotes (U+2018/U+2019) -> `'`, curly double quotes (U+201C/U+201D) -> `"`. Strip them even when pasting from a design or external text that includes them. **Not banned:** the right-arrow glyph (U+2192) and the middle dot (U+00B7) are allowed - use them freely (e.g. an arrow in UI or a `·` separator).
- **No stub / demo / mock data** - render `-` (a hyphen) or an empty state until a real endpoint exists. Mockup sample values are for layout only, not for shipping.
- **Run `pnpm lint` often** - the baseline is clean of ESLint errors, so new failures are clearly attributable to recent edits. Do NOT substitute `npx tsc --noEmit`; the root tsconfig has no files and exits 0 even when project references have errors. Use `pnpm lint` (or `tsc -b`) instead. Results go to `errors-eslint.log`, `errors-ts.log`, `errors-unused.log` (knip), `errors-depcheck.log`.
- **No migrations, no `ALTER`** - there IS a production D1, but it has no users yet, so both the local DB (`pnpm db-fast`) and the production DB (`pnpm db-fast-remote`) are reset and re-seeded wholesale from `sql/*.sql` on every run; we rebuild rather than migrate, so never write `ALTER`/migration files. Fold schema changes directly into the existing `sql/N.create-*.sql` files (`1.create-core.sql`, `2.create-leads.sql`, `3.create-inbox.sql`, `4.create-sms.sql`, `5.create-notifications.sql`, `6.create-automations.sql`, `7.create-sequences.sql`, `8.create-email-connections.sql`, `9.create-telephony.sql`, `10.create-misc.sql`); add a brand-new table as a new numbered create file. Static seed data lives in `100.seed.sql`.

## Free-tier limits & footguns

The Pages project runs on the Workers **Free** tier: **10ms CPU per request** (network/D1/fetch waits don't count) and 100k requests/day. Exceeding CPU returns Error 1102. Rules of thumb:

- **Never put a Pages `_middleware.ts` at the functions root.** It intercepts every static asset request too (JS/CSS/HTML) and forces them through Workers, which routinely 1102s on large bundles in cold colos. If you need a middleware, scope it under `/api/` (or the actual subtree). Geo-blocking is on Cloudflare WAF, not in code.
- **No heavy per-request compute on the request path** - PBKDF2 in [_shared/password.ts](functions/_shared/password.ts) is capped at 12k iterations (~8ms; drop to 10k if 1102s return). No xlsx parse, no big-payload JSON, no high-iteration crypto without a budget.
- **Pages projects can't enable `observability` in wrangler.toml** (validation error). For ad-hoc debugging, drop a temporary `console.log` and watch `pnpm realtime-logs` (`wrangler pages deployment tail`).

## Bot protection (Turnstile)

Public forms gate submit on a Cloudflare Turnstile token sent in the body as `turnstileToken` and verified by `verifyTurnstile(env, body?.turnstileToken, request)` in [_shared/turnstile.ts](functions/_shared/turnstile.ts). Frontend uses [src/components/Turnstile.tsx](src/components/Turnstile.tsx) with a `key={captchaKey}` you bump on failure to reset. Currently wired: login, register, forgot-password, reset-password, support, accept-invite. Google login is NOT gated (Google verifies it). Dev uses Cloudflare's TEST keys (always-pass); prod uses real keys whose widget config must include `www.warmchats.com` or it fails.

### SMS compliance / 10DLC strategy

WarmChats has moved away from per-client 10DLC registration. The model is a **single master campaign under Warmchats LLC** ("Master Campaign Umbrella") with every client number assigned underneath it.

- Use case: **Low-Volume Mixed**, $1.50/mo flat, shared across all clients.
- Each new agent costs only the local-number fee (~$1.00), is assigned to the master campaign instantly, and has no 3-month lock on cancel.
- Onboarding under `functions/api/telnyx/` should buy a local number, attach it to the shared `Warmchats - Cloudflare Pages` messaging profile, then assign the number to the master campaign.
- `user.telnyx_brand_id` / `telnyx_campaign_id` columns stay - they store the umbrella's IDs from env or a config row.
- `functions/_shared/smsCompliance.ts` is intentionally permissive (paid org with no Telnyx fields = allowed) so new users send through the master campaign by default.
- Cancellation = unassign the number from the master campaign and release it. No campaign teardown.

Master campaign description (verbatim for registration):

> This master platform campaign handles automated conversational real estate lead follow-ups, customer chat responses, and appointment notifications for individual agents utilizing our software infrastructure.

### SMS composer

Outbound SMS in the inbox composer allows up to **5 segments** (5 x 160 = 800 chars) before the Send button is disabled. Personalization tokens expand at send time, so drafts legitimately exceed 160 chars. Use `SMS_MAX_SEGMENTS` in [Inbox.tsx](src/components/Inbox.tsx) with `smsSegmentCount` / `smsSegmentError` from [smsSegments.ts](src/utils/smsSegments.ts). Block via `smsSegmentCount(body) > SMS_MAX_SEGMENTS`, not raw `length > 160`.

### SMS opt-out (STOP / START)

Inbound SMS bodies are matched for opt-out/opt-in keywords in [webhooks/telnyx/inbound.ts](functions/api/webhooks/telnyx/inbound.ts). On `STOP`/`UNSUBSCRIBE` we set `sms_contact.opted_out` + `lead.sms_opt_out`, flip consent status, and **cancel any future scheduled SMS** to that lead so the cron never re-messages them. `START`/`UNSTOP`/`YES` re-subscribes. Telnyx's carrier-level STOP already blocks outbound; we still record consent locally so our own automation/cron queueing path skips the lead.

### Lead import + auto-enrollment

**No mass outbound. Leads enter an outbound workflow only by opting in** (a website lead form / Zapier+ManyChat integration / a deliberate per-lead manual add), NEVER by mass-adding a saved or imported lead list. This is a hard compliance stance: bulk import and outbound-campaign creation must not be able to blast a list. Two former mass-outbound entry points were removed (2026-06-03):

1. **Bulk lead import** no longer offers outbound automation enrollment. The import wizard's step 4 is now a single **inbound-only** switch (reactive AI replies). `applyImportAi` ([useLeadImport.ts](src/components/leads/hooks/useLeadImport.ts)) posts `/leads/import/<org>/apply-ai` with `inbound_enabled` only - it never sends `automation_id`, so importing can only flip `ai_status` (off -> 'active'), never queue a proactive send.
2. **Outbound campaign creation** ([WizardV2.tsx](src/components/ai-v2/WizardV2.tsx) `WorkflowWizard`) no longer has an "Audience" step and `createAuto` ([AgentV2.tsx](src/components/ai-v2/AgentV2.tsx)) no longer calls an enroll. Creating a workflow now just defines the template (status Running, zero recipients - the cron sends nothing until a lead opts in). The Draft "Launch" / "Resume" buttons are status-only (they never bulk-enroll). The frontend `enrollAutomation` wrapper was deleted; `POST /api/automations/:id/enroll` + `bulkEnrollAutomation` stay server-side as the per-lead plumbing the future opt-in intake will call.

Importing alone never proactively texts a lead. The two switches still exist conceptually, but the bulk-import UI exposes only the inbound one. The outbound `automation_id` path on `/apply-ai` is retained for the **deliberate per-lead MANUAL add** flows (Add Lead modal [AddLeadCampaignModal.tsx](src/components/leads/components/AddLeadCampaignModal.tsx) / inbox create-lead), which enroll ONE consented lead at a time:

- **Outbound automation** (`automation_id` in the apply-ai body, manual-add only): enroll a lead into a chosen **automation**. `queueAutomationForLead` / `bulkEnrollAutomation` in [automationEnroll.ts](functions/_shared/automationEnroll.ts) materialize the automation's opening `message` + `followup_steps` into `scheduled_message` (tagged `automation_id`) for the cron to dispatch. **One active automation per lead** - any pending drip is cancelled first (switch semantics). Enrolling QUEUES (not gated by the AI switches), but the **SEND is gated by the AI controls**: the cron ([scheduledMessages.ts](workers/cron/jobs/scheduledMessages.ts) via [aiGate.ts](workers/cron/_shared/aiGate.ts)) HOLDS an outbound drip row in `status='scheduled'` unless the global master AND the Outbound agent are both on (inbound AI-reply rows -> master + Inbound agent), in addition to the existing consent/opt-out/quiet-hours/rate-limit guards. "Hold" means it resumes the moment the switch is turned back on - it is never cancelled by the gate. Fail closed (AI off by default). Same gate is applied to the sequence dispatcher ([sequenceDispatch.ts](workers/cron/jobs/sequenceDispatch.ts), Outbound).
- **Inbound AI reply** (`inbound_enabled`): whether the **reactive** AI Inbound Flow (qualification + missed-call + booking handoff, via `advanceQualification` in `qualificationFlow.ts`) auto-replies when the lead writes back. This fires only AFTER a lead replies - it is never proactive. (The old instant-reply + day-1/day-3 drip was removed because it duplicated the outbound automation; cold inbound from an unknown number starts the qualification flow when Inbound is enabled.)
- The lead's **`ai_status` encodes the combination**: inbound on -> `active` ("AI Active"); automation-only / inbound off -> `outbound` ("Automation Only" - partial, blue pill); neither -> `off`/NULL ("AI Off"). The column defaults to NULL (AI off by default), so a freshly imported lead reads "AI Off" until enrolled.
- **Still pending (the "input" side):** the actual opt-in intake (a public website lead-form endpoint + Zapier/ManyChat webhook) that creates a warm lead and enrolls it per-lead into an "incoming warm leads" outbound workflow is NOT built yet - the per-lead `bulkEnrollAutomation`/`queueAutomationForLead` plumbing and the `/automations/:id/enroll` route are kept for it to call.
- **Stop-on-reply**: any inbound reply from a known lead cancels their pending automation drip (`cancelPendingFollowups`).
- Leads should **display which automation they're in** (the `ai_status` pill + the automation's `scheduled_message` rows).

### Lead timezone & quiet hours

Every lead carries a `timezone` (auto-detected from US area code on create/import via [usAreaCodeTimezone.ts](functions/_shared/usAreaCodeTimezone.ts), or set manually; provenance tracked in `timezone_source`). Outbound sends are gated by `checkQuietHours()` in [quietHours.ts](functions/_shared/quietHours.ts), which prefers the lead's timezone and falls back to the org's configurable window (defaults 8am-9pm, half-open `[start, end)`).

- The guard runs on **every** outbound path: [messages/send.ts](functions/api/messages/send.ts), [inbox/send.ts](functions/api/inbox/send.ts), [automations/send/[automationId].ts](functions/api/automations/send/[automationId].ts), and the cron jobs [scheduledMessages.ts](workers/cron/jobs/scheduledMessages.ts) / [sequenceDispatch.ts](workers/cron/jobs/sequenceDispatch.ts). Adding a new send path means wiring the guard too - omitting it is a compliance regression.
- Interactive sends return **HTTP 200 with `code: "QUIET_HOURS"`** in the body and an `until` ISO timestamp so the UI can offer a retry. The 200 (instead of 4xx) keeps Cloudflare's error logs clean - clients detect the block via the body `code`, not the status. Cron jobs skip the tick and retry at `until`.
- `checkQuietHours` returns `null` when neither lead nor org has a timezone, meaning no guard at all. Don't tighten that into a hard block.
- **One account timezone = `organization.timezone`** is the single source for workspace/account/booking defaults: `agent_availability.timezone` already falls back to it server-side ([availability.ts](functions/_shared/availability.ts)), the Inbox `ThreadClock` falls back to it when a lead has none, and `register.ts` now seeds it from the browser-detected zone the signup form sends (it was being ignored - all new orgs defaulted to Eastern). All timezone selectors use the shared searchable full-IANA `<TimezonePicker>` ([src/components/TimezonePicker.tsx](src/components/TimezonePicker.tsx), `Intl.supportedValuesOf` + search, inline-styled so it works in `.wcv2` and plain pages) - wired into the Settings Workspace Timezone card and the AvailabilityEditor (the old 4-7 zone hardcoded lists were removed; the dropdown portals to `document.body` so an `overflow:hidden` card never clips it). Backend validates any zone via `normalizeTimezone` ([timezoneAliases.ts](functions/_shared/timezoneAliases.ts)).

## Notifications

Client safety net: the in-app **toast** normally fires only off the live WS `notification` event. If that event is missed (socket blip, DO hibernation race, or a `notify()` whose emit didn't reach the tab) the bell would update via the 45s poll but no toast ever showed. [NotificationsContext.tsx](src/context/NotificationsContext.tsx)'s `pollRefresh` now surfaces a fallback toast for genuinely-new, unread, recent (<3 min) notifications it hasn't shown yet, deduped against the live path via `surfacedToastIdsRef` (the initial fetch seeds that set without toasting, so a login backlog doesn't burst).

All server-side notifications go through a single entry point: `notify(env, {...})` in [notify.ts](functions/_shared/notify.ts). It persists the row (when `persist` is set), emits a live event to the gateway Worker over WebSocket, and fans out a web push (VAPID, RFC 8291 aes128gcm) via [webPush.ts](functions/_shared/webPush.ts) - each step gated by the user's per-kind preferences (`notify_sms_inbound`, `notify_calls`, `notify_appointments`, etc.). Don't insert notification rows or push directly; call `notify()` so preference gating and fan-out stay consistent. The service worker [public/sw.js](public/sw.js) handles push display and click/action routing.

**Notification action buttons run IN the app, never headless in the SW.** The SW does NOT send replies or answer calls itself - it can't answer a WebRTC call, and the send endpoints return HTTP 200 with `code:"QUIET_HOURS"` on a quiet-hours block, so a headless `fetch` would falsely report "sent". Instead `notificationclick` hands the action to the app via [NotificationActionBridge.tsx](src/components/notifications/NotificationActionBridge.tsx): it focuses an open window and `postMessage`s a `wc-notif-action` ({action, kind, path, data, reply}), or - if no window is open - `openWindow`s the route with the action encoded in `wc*` URL params (`wcaction`/`wckind`/`wcreply`/`wcto`/`wcemail`/`wcthread`/`wclead`/`wccall`) which the bridge replays on boot then strips. The bridge sends replies through the same composer endpoints (`/messages/send`, `/inbox/send/reply`) - surfacing sent/quiet-hours/error as a toast and opening the thread - and answers/declines via the live `useCalling()` SDK (`acceptIncoming`/`rejectIncoming`). The only reply still handled inside the SW is the test notification (`data.test === true`), which stays a local "Test reply captured" no-op. Call notifications route to `/inbox?tab=calls` (the calls workspace is embedded in the Inbox - there is no `/inbox/calls/:id` route).

## AI agents (Assistant / Inbound / Outbound)

The AI section is a single sidebar item **AI Agent** (`/ai/agent`) -> the v2 **AI Command Center** (`src/components/ai-v2/AssistantV2.tsx`): one tabbed page - **Overview / Activity Feed / Inbound / Outbound / Action Center / Knowledge Base / Test AI / AI Settings**. Inbound + Outbound are tabs (rendered by `src/components/ai-v2/AgentV2.tsx`: workflow cards + custom auto-responders, the automations manager, per-agent templates, logs, and the inbound booking-availability editor), NOT separate pages. Automations are created from the Outbound tab's in-modal wizard + template gallery (`POST /api/automations`); editing one opens `/automations/:id` (`AutomationDetails`). The `Test AI` tab includes the live assembled-system-prompt viewer. **No redirect routes** for removed pages (pre-production - a removed page should 404, so don't add `Navigate` redirects).

**3 levels of control** for the **reactive inbound flow** (`advanceQualification` in `qualificationFlow.ts` via `aiSendAllowedForLead` in `functions/_shared/autoResponse.ts`). NB: explicit **automation enrollment** at import is NOT gated by these - see "Lead import".

1. **Global master** - `app_settings` key `ai_master_enabled` per org. Toggled from the AI Agent hero / AI Overview via `PATCH /api/ai/settings`.
2. **Per-agent** - Inbound = `auto_response_settings.enabled` (PATCH `/api/ai/agents/inbound` **upserts** the row so the toggle can't silently no-op); Outbound = `ai_agent_state.enabled`.
3. **Per-lead** - `lead.ai_status` of `paused`, `off`, or `outbound` all stop the inbound auto-reply for that contact (`outbound` = enrolled in an automation but inbound replies off).

**AI is OFF by default**: `/api/ai/settings` and `/api/ai/agents` default `master_enabled` AND every per-agent toggle (inbound + outbound) to false when no row exists; `register.ts` seeds new users with `ai_master_enabled='0'` + an `auto_response_settings` row (`enabled=0`). To see anything fire you must turn master + Inbound on.

**Usage metering**: every LLM call counts. `generateWithOpenAI(env, sys, user, { orgId })` increments `usage.ai_requests` (even small calls - pass `orgId` at every call site). The agent stat strip shows real numbers only (activity + errors from `ai_activity_log`, requests + est. cost from `usage`) - no stub KPIs.

**Agent knowledge profile**: `buildAgentSystemPrompt(env, orgId, userId, agentKey)` in `functions/_shared/aiAgents.ts` layers the base rules + agent role + the structured `agent_profile` facts + per-agent prompt/tone + a "if a fact is missing, ask or defer - never invent" rule, and is fed into the reply/test-chat prompts.

New tables: `ai_agent_state` (per `org_id`/`user_id`/`agent_key` on/off + `system_prompt`/`tone`/`display_name`), `ai_workflow` (toggle cards), `ai_activity_log` (`sql/17`), `agent_profile` (`sql/18`, one row per org/user - brokerage facts, service areas, commission rules, listings, calendar link, tone, etc.); `message_templates` gained `agent` / `sent_count` / `last_used_at` (`sql/6`). Routes: `functions/api/ai/agents/**`, `functions/api/ai/agent-profile.ts`, `functions/api/ai/settings.ts`.

**Workflow cards (design + current wiring)**: `ai_workflow` rows model the toggle cards per agent. Inbound `w1-w4` map onto `auto_response_settings.{inbound_sms_enabled, qualification_enabled, missed_call_enabled, inbound_new_send_reply}` and the `PATCH /api/ai/agents/inbound/workflows/[workflowKey]` route mirrors the flip onto that settings row. **`w5` ("Booking intent -> push appointment") is the booking master control: it is NOT a settings column - it drives `agent_availability.enabled`, the SAME flag the Availability editor's master switch (`AvailabilityEditor`) toggles, so the card and the editor are one toggle** (`getBookingEnabled`/`setBookingEnabled` in [availability.ts](functions/_shared/availability.ts); the workflows GET sources w5 from it, the PATCH writes it, both frontends cross-invalidate `["availability"]` + `["ai-workflows","inbound"]`). It defaults **ON** (matching `agent_availability.enabled DEFAULT 1`), and gates booking in both the orchestrator (`getAvailability().enabled` -> `findOpenSlots`/`isSlotBookable`) and the inbound system prompt (`buildAgentSystemPrompt` emits an "APPOINTMENT BOOKING: ON/OFF" line). The legacy `auto_response_settings.booking_handoff_enabled` column is now unused for w5. Outbound `o1-o6` are *meant* to pause/resume the matching automation/sequence but currently only persist `ai_workflow.enabled` (engine mapping not wired). The `WorkflowCard` UI and the `ai_workflow` seed rows are not built yet, so the Workflows tabs are empty (see Outstanding work).

**Activity log**: `ai_activity_log` (`org_id`, `user_id`, `agent_key`, `event` like `reply.sent` / `lead.qualified` / `appointment.booked` / `reply.skipped`, `lead_id`, `detail`, `status` in `ok|warn|error`, indexed `(org_id, agent_key, created_at desc)`) feeds the Logs tab + the right-rail Live activity; write to it via `logAgentActivity` in `functions/_shared/aiAgents.ts`.

## Dashboard

The dashboard was **redesigned** into an AI-first layout (`src/components/DashboardV2.tsx` + `src/components/V2/Dashboard/*`): a monthly-goals **KPI strip** (Pipeline Value / Hot Leads / Appointments / Deals Closed vs goal, with a month selector), **Needs reply** (waiting count + urgent + top-3 AI-prioritized), a **Hot leads** table (score ring, source/channel pills, inline SMS/Call/Book), **AI Intelligence** cards, **AI Wins Today**, a 30/60/90 **Conversion Funnel**, **Today's schedule**, **Quick actions**, a full-width **Conversation Feed**, and an **Agents pulse** widget linking into `/ai/*`. Aggregates come from `/dashboard/org/{id}/*`; ~11 old `V2/Dashboard/*` widgets were deleted in the redesign. Pure-white background, Plus Jakarta Sans (no serif).

## V2 design refresh (leads-remix-2 prototype)

A design handoff bundle in `leads-remix-2/project/leads/` (HTML/CSS/JS prototypes from claude.ai/design) is being recreated **pixel-perfect** as new pages. The 9-piece plan: redesign Calendar, build Tasks/Deals/Reporting, restyle Leads (keep all features), do NOT touch the Dashboard overview, add a **Settings** rebuild (now THE `/settings` page) + **AI Agent v2** sidebar pages, and finally write a plan to wire the AI Agent page to the backend. Tasks are done **one per conversation** to keep context lean.

**Shared porting infrastructure (in `src/components/ai-v2/`)** - reuse this for every remaining v2 page; do NOT re-derive it:
- **`prototype.css`** - the design bundle's entire `<style>` block (from `index.html`), extracted **verbatim**. Only the globals are scoped: `:root` vars + `body`/element resets are pinned under a `.wcv2` wrapper (so they can't leak into Tailwind/shadcn tokens like `--accent`/`--muted`/`--radius`), and the `pulse` keyframe was renamed `wcv2pulse` (Tailwind `animate-pulse` collision). Every `.wc-*` rule is left untouched - those classes are unique to the design and only match inside a `.wcv2` subtree, so NO Shadow DOM is needed and React events/router/context work normally. This one stylesheet serves ALL v2 pages.
- **`Icon.tsx`** - the prototype's `ICON_PATHS` + `<Icon name size stroke fill>` ported verbatim (pixel-identical SVGs; do not swap for lucide).
- **`tones.ts`** - the `TONES` tone->{fg,bg} palette.
- Fonts (Plus Jakarta Sans / Newsreader / JetBrains Mono) are loaded via a `<link>` in root `index.html`.

**How to add a v2 page**: port the prototype `.jsx` to TSX preserving exact structure/classNames, render it inside `<MainLayout>` wrapped in `<div className="wcv2 min-h-[calc(100vh-4rem)] lg:-mx-4 lg:-mt-4">` (the negative margins cancel MainLayout's inner padding so the design sits edge-to-edge; the min-h keeps the white bg filling the viewport), map the prototype's `go(navKey)` onto real routes via `useNavigate`, add a lazy route in `App.tsx` + a `SideBar.tsx` NavItem. Compliance still applies to ported text: **strip emojis**, convert smart punctuation to ASCII (em/en dash -> `-`, curly quotes -> straight, `...`, `~` for approx, `x` for times) but keep `·` and `→`; type props (no `any`); keep data constants unexported (only export components) for `react-refresh`. Drop genuinely-dead prototype helpers/data (the design files carry unused leftovers that trip `no-unused-vars`).

**Shipped so far**:
- **AI Agent v2** (task 8) - `/ai/agent` (the sidebar "AI Agent", `Sparkles` icon - the only AI page; the old multi-page `/ai/*` layout was removed), a port of the AI Command Center (`assistant.jsx`) with all 7 tabs (Overview, Activity Feed, Inbound, Outbound, Action Center, Knowledge Base, AI Settings); Inbound/Outbound reuse the ported `AgentV2.tsx`, which uses the modals in `WizardV2.tsx`. **Now wired to live data** (no longer sample-only): master + per-agent toggles -> `/api/ai/settings` + `/api/ai/agents/*`; Overview/Activity/Action-Center -> `/api/dashboard/org/:id/kpis` + `/api/ai/{activity-log,next-steps,action-center}/:id`; AI Settings persona form persists to `agent_profile` (incl. `persona_json`); Knowledge Base FAQ CRUD -> `/api/ai/knowledge`; Test AI -> real `/api/ai-agent/test-chat` sandbox; per-agent Templates tab -> real `message_templates` CRUD (`/api/ai/templates*`, seeded via `seed-agent-library`); Workflows tabs -> `ai_workflow` (lazy-materialized); Outbound wizard -> `POST /api/automations`. See the "AI-native CRM" section for the full backend.
- **Calendar** (task 1) - `/appointments` ([AppointmentsCalendar.tsx](src/components/AppointmentsCalendar.tsx)) was **reskinned in place** to the `calendar.jsx` design (left rail mini-cal + Schedule/AI-Suggestions tabs, day/week/month grid, event + create modals) on top of the **real data layer**: appointments come from `fetchOrgAppointments` plus locally-created ones, with the inbox/lead nav wired. A real `Appt` is projected onto the design grid via `toRender` (kind/loc derived from `meeting_type`+title). **No mock data** - the old seed-appointment fallback, the static `AI_SUGGEST` cards, and the hardcoded "AI Daily Brief" were all removed; an empty org shows empty states (the AI Suggestions tab is an empty state until a real endpoint exists). The whole page lives under `.wcv2`.
- **Tasks** (task 2) - `/tasks` ([TasksPage.tsx](src/components/tasks/TasksPage.tsx)) was rebuilt from the stub into the `tasks.jsx` design (AI Recommended cards + an All Tasks table with Today/Overdue/Upcoming tabs, complete/dismiss). There is **no tasks backend** (only per-call `call_tasks`), so by explicit user choice this is a **pixel-perfect demo with the design's sample data** (like the example pages), not wired to real data. `go()` maps the prototype nav keys to real routes; the dead `filter`/`FILTERS` machinery the prototype never rendered was dropped.

- **Deals** (task 3) - `/deals` ([DealsPage.tsx](src/components/deals/DealsPage.tsx), new route + sidebar "Deals" under Workspace, `Tag` icon) is the `deals.jsx` design: a 3-tab pipeline (Buyer/Seller/Renter), KPI strip, AI stage-suggestion banner, drag-and-drop kanban columns, and an Add Deal modal. There is **no deals backend**, so (matching the Tasks decision) it is a **pixel-perfect demo with sample data**. Local state only - drag-to-move, AI "accept suggestion", and create all mutate in-memory.
- **Reporting** (task 4) - `/reporting` ([ReportingPage.tsx](src/components/reporting/ReportingPage.tsx), new route + sidebar "Reporting" under Workspace, `BarChart3` icon) is the `reporting.jsx` design: a 10-tab analytics workspace (Overview, Properties, Lead Sources, Calling, SMS, Email, AI Performance, Deals, Appointments, Agent Goals) with KPI strips, bar charts, proportional pipe-bars, source/property tables, and an agent-goal drill-down + goal-edit modal. **No reporting backend** -> pixel-perfect demo with sample data. The prototype's unused `ActivityTab`/`FunnelTab`/`PipelineTab` (defined but never rendered) were dropped to keep lint clean.
- **Leads** (task 5) - `/leads` ([Leads.tsx](src/components/leads/Leads.tsx)) got a **light reskin in place** (explicit user choice - "a bit, without losing features"), NOT a full board.jsx rebuild. Only presentation changed: the page content is wrapped in `.wcv2` (adopts the design's Plus Jakarta Sans + warm palette), and the header (`wc-pagehead`/`wc-ghostbtn`/`wc-primary`), KPI strip (`wc-kpi`), quick-filter chips (`wc-qchip`), and table chrome (`wc-table`) were restyled. **Everything functional is untouched**: the 8 filter dropdowns, grid/table view toggle, grid `LeadCard`, inline pill-editors, bulk actions, CSV export, search, pagination, all modals (Add/Edit/Import/Delete), AI panel, and all data wiring. The per-quick-filter color maps were dropped (the design uses uniform orange chips). Deliberately NOT restyled (too risky for "a bit"): the inline-editor table cells, dropdown internals, and grid cards keep their existing styling.
- **Settings** (`/settings`) - [SettingsPage.tsx](src/components/settings/SettingsPage.tsx) (sidebar "Settings" under Workspace, `Settings` icon). This is THE settings page (an `admin.jsx`-design port serving the `/settings` route). `ConnectedAccountsPage` ([connect-email]) and `Upgrade` ([/upgrade]) remain as standalone pages reused elsewhere. Tab order: Workspace Settings, Billing & Usage, Organization (custom-brokerage only), Lead Exchange (custom-brokerage only), Compliance, Action Plans (coming soon), Integrations (coming soon). The active tab lives in `?tab=` (`useSearchParams`, linkable / survives reload; a Gmail OAuth `?status=` return forces the Workspace tab; `#business-address` deep-link scrolls + flashes the address field). Wired tabs: **Workspace Settings** (profile + business address via `PUT /profile/me`; 11 notification toggles via `/me/notification-settings`; browser-push enable/disable + test-notification/test-call rows + install-app row; password via `/profile/change-password`; rich Email/SMS channel cards + Default channels + Sending-address editor via `src/api/connectedAccounts.ts`; API keys via `src/api/integrations.ts`; Team accounts; Workspace timezone + Quiet hours via `/orgs/:id/{timezone,quiet-hours}`; Delete account via `DELETE /auth/account`), **Billing & Usage** (real plan/status/usage from `/bootstrap/me` + calling usage; Manage-subscription / Update-payment / View-invoices open the Stripe portal via `/billing/portal-session`; Change-plan cards at the BOTTOM derive "current" from real billing and route to `/upgrade?plan=`), **Compliance** (read-only opt-out/block overview via `GET /compliance/summary`), and **Organization** (Users + Teams real via `/auth/users` + `/teams`; **Offices** a real CRUD on the `office` table `sql/25` + `functions/api/offices/{index,[officeId]}.ts`; **Lead Routing** under a `ComingSoonCover`). **Action Plans + Integrations** render behind a `ComingSoonCover`; **Lead Exchange** stays design-only. Cookie-auth helpers live in [backend.tsx](src/helpers/backend.tsx) (`saveProfileMe`/`changePassword`/`deleteAccount`/`patchNotificationSettings`/`fetchOrg{Timezone,QuietHours}`+`patchOrg*`/`fetchSendingAddress`/`saveSendingPrefix`/`openBillingPortal`/`sendTestNotification`/`fetchOrgUsers`/`fetchOrgTeams`/`fetchOffices`/`createOffice`/`deleteOffice`); the connected-accounts/integrations `src/api/*` wrappers stay Bearer-`localStorage`-token (sentinel `"cookie"`; same-origin cookie authenticates) - two auth styles, one session. **Styling gotcha**: the page is inside `.wcv2`, so wired cards use `.wc-*` classes / inline-token styles (Tailwind utilities no-op there); the `<TimezonePicker>` dropdown is portaled to `document.body` to escape `.wc-panel-card { overflow:hidden }`.
- **Inbox** (task 9) - `/inbox` ([Inbox.tsx](src/components/inbox/Inbox.tsx) + [InboxTabs.tsx](src/components/inbox/InboxTabs.tsx) + [MessageBubble.tsx](src/components/inbox/components/MessageBubble.tsx)) got a **full Messages reskin to `inbox.jsx`** wired to the real data (after user feedback that the light pass "looked the same"). The whole inbox is wrapped in `.wcv2`; restyled: Messages/Calls tabs (`wc-inbox-tabs`), conversation items (`wc-convo` avatar/name/time, status badges + `wc-convo-stage` derived from `total_unread_count`/`getIntent`/`getLeadType`/stage/tags, orange `wc-convo-unread`, `is-active` bg), search (`wc-ibx-search`) + a new `wc-ibx-filters` chip row (All/Needs Reply/Hot/Buyers/Sellers - now applied **server-side** via a `filter` query param on `/api/inbox/contacts`, not just over the loaded window, so a matching contact past the page/300 cap still surfaces; counts stay org-wide), message bubbles (`wc-msg`: blue right-aligned outgoing, timestamp under, `wc-msg-tag` AI marker, `wc-msg-sys`), a live thread `ThreadClock` (`wc-clock`), and more compact buttons. **All features preserved** (send, attachments, delivery ticks, appointment cards, channels, modals, pagination, real-time). Caveats: (1) outbound bubbles carry a marker above them - conversational-AI sends show a sparkles **"AI Agent"** tag, automation (campaign / workflow) drips show the **automation's name** with a `route` icon, and human-composed sends show nothing. The AI tag is driven by a real `sent_by_ai` flag on `sms_message`/`inbox_messages` (set 1 by `sendLeadSms`/`sendLeadMms`/`sendLeadEmail`, the qualification flow, and `instantReply`; plumbed through `scheduled_message.sent_by_ai` + `queueScheduledMessage({sentByAi})` for quiet-hours-deferred AI sends). The campaign tag is driven by `automation_id` on those same message rows (set by the cron `scheduledMessages` persist from `scheduled_message.automation_id`), joined to `automation.name` as `campaign_name` in `/api/inbox/contacts/:leadId/messages`. The old `sender_name` heuristic in [MessageBubble.tsx](src/components/inbox/components/MessageBubble.tsx) stays only as an email fallback. Schema changes require a `db-fast` / `db-fast-remote` reseed. (2) the thread `ThreadClock` now uses the lead's `timezone` if set, else falls back to the **org/account timezone** (`organization.timezone`, fetched in the Inbox from `/orgs/:id/timezone`), and only then the browser - so a lead with no timezone shows the account's local hour, not the agent's. (3) **"Needs Reply" = the lead spoke last**, NOT unread. The contacts endpoint computes a per-contact `needs_reply` flag from the most-recent message's direction (`last_activity_direction === 'inbound'`) across SMS+email; the chip count + chip filter + row badge + top-pin sort all key off `needs_reply`, so READING a message no longer clears it (only sending an outbound reply does, after the next contacts refetch). This also keeps the org-wide chip count consistent with the visible list (the old `unread > 0` definition drifted: an optimistic read zeroed the list row but left the stale server count). The chip filter is applied **server-side** (`filter=needs_reply|hot|buyers|sellers` on the contacts endpoint), and `fetchContactDetail` **injects** a deep-linked/selected lead into the list when it isn't on the loaded page - both because a busy queue can push a fresh inbound past the page/300-row cap, which previously left it invisible (chip said 1, list empty) and un-highlighted after a `?lead=` reload. The contacts query also hides **empty conversations** (`AND EXISTS (...sms_message...)`) so a conversation a crashed dispatcher created but never filled doesn't render as a blank thread. **Calls** view reskin to `calls.jsx` is still pending.

Gotcha (fixed): scoping the prototype's element resets as `.wcv2 button` outranks the `.wc-primary`/`.wc-ghostbtn` class rules (specificity 0,1,1 > 0,1,0) and strips their border/background - they are wrapped in `:where(.wcv2)` (zero specificity) in `prototype.css` so the design's button styles win, matching the original bare-element cascade.

Gotcha (Tailwind utilities lose to `prototype.css` inside `.wcv2`): Tailwind v4 (`@import 'tailwindcss'`) puts every utility in the `utilities` **cascade layer**, while `prototype.css` is imported as plain (unlayered) CSS. Unlayered rules beat layered ones regardless of specificity, so the unlayered `:where(.wcv2) button{border:none;background:none;color:inherit}` reset (and any `.wc-*` rule) overrides Tailwind classes like `bg-orange-500`/`max-w-120`/`rounded-2xl` on elements inside `.wcv2`. **Do not style new UI inside a `.wcv2` subtree with Tailwind utilities** - they silently no-op (this is why a Tailwind-built calendar "New appointment" popup rendered unstyled/full-bleed). Use the design-system `.wc-*` classes (e.g. `.wc-modal`/`.wc-modal-scrim`/`.wc-modal-input`/`.wc-modal-foot`) and/or inline `style={{...}}` (the style attribute outranks unlayered rules too) with the design tokens (`var(--accent)`, `var(--line)`, etc.).

## AI-native CRM (tool-calling inbound agent + booking + tasks/deals/escalation)

The inbound brain is a real **LLM tool-calling agent**, not keyword routing. "LLM proposes, code disposes": the model emits tool calls + reply text; every side effect runs in guarded code.

- **Tool client**: `chatWithTools(env, messages, tools, opts)` in [openai.ts](functions/_shared/openai.ts) (OpenAI function calling, `gpt-4o-mini`, metered in `usage` per call). `generateWithOpenAI` stays for simple one-shot calls.
- **Orchestrator**: `runInboundAgent(env, leadId, replyText, { channel, subject })` in [aiOrchestrator.ts](functions/_shared/aiOrchestrator.ts) - 3-level gate -> load profile/settings/thread -> system prompt = `buildAgentSystemPrompt("inbound")` + lead profile + playbook + availability summary + a CHANNEL line -> bounded tool loop (`MAX_STEPS`). Tools: `send_message`, `update_lead`, `get_calendar`, `find_appointment_slots`, `book_appointment` (proposed; conflict -> alternatives), `escalate_to_agent`, `create_task`, `upsert_deal`, `get_agent_knowledge`, `search_listings`/`send_mms` (SMS-only, listings-gated), `finish`. `logAgentActivity` per action; `refreshLeadIntelligence` at end. **Falls back to the template flow** (`advanceQualification`) on missing key / loop error (SMS only). Wired from [inboundProcessing.ts](functions/_shared/inboundProcessing.ts).
- **Channel-aware (SMS + email)**: the agent answers on whichever channel the lead used. `channel:"sms"` -> history from `sms_message`, `send_message` via `sendLeadSms` (cap 1000 chars). `channel:"email"` -> history from the lead's email `inbox_messages` thread (bodies clamped), `send_message` via `sendLeadEmail` ([leadEmail.ts](functions/_shared/leadEmail.ts), cap 4000 chars). `sendLeadEmail` is the compliant email mirror of `sendLeadSms`: `email_opt_out` hard-stop, quiet-hours -> queue, dispatch via the mock-aware `dispatchOutboundEmail` (Elastic/Gmail), persist into the email thread. `processInboundEmail` calls the agent when `auto_response_settings.inbound_email_enabled` (sql/10, default on) + the 3-level gate pass; unknown senders create an `Inbound Email` lead (parity with the SMS unknown-number path). Tool errors are caught per-call and fed back to the model; tool outputs are size-bounded.
- **The single compliant SMS path**: `sendLeadSms` in [leadSms.ts](functions/_shared/leadSms.ts) - STOP/suppression, quiet-hours -> queue, per-second rate limit at cron, CTIA STOP footer. Every lead SMS goes through it.
- **Agent availability = ONE source of truth**: `agent_availability` (one row per org/user; `weekly_hours`/`exceptions` JSON, slot/buffer/notice/horizon). Service `findOpenSlots`/`isSlotBookable` (DST-safe) in [availability.ts](functions/_shared/availability.ts); endpoint `/api/availability` (GET/PATCH). Shared `<AvailabilityEditor/>` ([src/components/availability/](src/components/availability/)) is reachable from `/availability` and AI Inbound settings - all edit the same row. **"Agent" = the human user**, who sets when he is bookable. **Booking = AI books as `proposed`; the human confirms** (existing `proposed -> confirmed` flow); `isSlotBookable` is also the double-booking guard.
- **Tasks / deals / escalation**: `createTask` ([tasks.ts](functions/_shared/tasks.ts), table `task` sql/22), `upsertDealForLead` ([deals.ts](functions/_shared/deals.ts)), `openEscalation`/`resolveLeadEscalations` ([escalation.ts](functions/_shared/escalation.ts), table `lead_escalation` sql/20). The escalation **ladder cron** ([escalationAdvance.ts](workers/cron/jobs/escalationAdvance.ts)) advances level 1->2->3 (in-app -> SMS-to-agent -> push/email) every ~15m until resolved. Deterministic `refreshLeadIntelligence` ([leadIntelligence.ts](functions/_shared/leadIntelligence.ts)) sets `lead_score`/`next_best_action`/`ai_summary` (a baseline; the agent can override via `update_lead`).
- **Escalation rules in the prompt**: `buildAgentSystemPrompt` injects the configured `escalation_keywords` (not just the deterministic matcher in `inboundProcessing.ts`) so the model proactively hands off. Plus a **no-listings rule** `auto_response_settings.escalate_no_listings` (default ON, toggle at AI Agent > Knowledge Base > Escalation via `/api/ai/rules`): when the org has zero offerable listings (`countOfferableListings`), the orchestrator already withholds the `search_listings`/`send_mms` tools, and with this on the `listingLine` tells the AI to escalate the moment a lead asks about specific homes/inventory/pricing (instead of just deferring) - never invent listings or quote prices.
- **Outbound card -> automation mapping** ([workflows/[workflowKey].ts](functions/api/ai/agents/[agentKey]/workflows/[workflowKey].ts)): `o1-o5` toggles pause/resume the automations linked through `automation.workflow_key` (an EXPLICIT, declared link - the wizard quick-starts set it; no fuzzy name matching). The cron's [scheduledMessages.ts](workers/cron/jobs/scheduledMessages.ts) now **skips a row whose automation is Paused** (holds it in `scheduled` so resume re-flows it). Creating an automation under an off card starts it `Paused`. The Workflows GET returns a `governed` count per card.
- **Opt-status surfaced**: `/api/inbox/contacts/:leadId/messages` returns `sms_opt_out`/`email_opt_out`/`sms_consent_status`; the inbox header (`AiContactBadges`) shows a red "SMS/Email opted out" badge. Re-subscribe is **deliberately not a one-click action** (a STOP'd consumer must text START - the inbound webhook handles that); the badge tooltip says so.
- **Manual-add instant reply**: `scheduleInstantReply` ([instantReply.ts](functions/_shared/instantReply.ts)) fires ONE opening only when the agent explicitly picks "Send now" on manual lead-add (compliance-gated, +30s). This is NOT the auto instant-reply-on-create drip that was deliberately removed; form/webhook auto-instant-reply remains a flagged product decision (not wired).
- **New schema** (folded into existing files + new numbered ones; reseed via db-fast / db-fast-remote): lead columns `bedrooms/bathrooms/property_type/seller_price_expectations/lead_score/next_best_action/ai_summary*` (sql/2); `lead_escalation` + `ai_knowledge_entry` (sql/20); `agent_availability` (sql/21); `task` (sql/22); `agent_profile.persona_json` (sql/18); `auto_response_settings.{escalation_keywords,always_say,never_say,fair_housing_guard}` (sql/10); `automation.workflow_key` (sql/6). New endpoints under `functions/api/ai/{knowledge,next-steps,activity-log,action-center}`, `functions/api/{availability,tasks,deals}`, `functions/api/dashboard/org/[orgId]/kpis.ts`, `functions/api/leads/{filter-options,[orgId]/ai-analysis}`.

## Outstanding work

Known gaps still pending:

- **Workflow cards** - the v2 `AgentV2.tsx` Workflows tab renders the canonical cards from `ai_workflow` (lazy-materialized by `ensureWorkflows`, inbound `w1-w5` / outbound `o1-o5`). Inbound toggles mirror onto `auto_response_settings` flags; outbound `o1-o5` pause/resume the automations linked via `automation.workflow_key`, and the cron honors a paused automation (holds its queued drips).
- **Inbound placeholders**: `Lead Scoring`, `Buyer AI`, `Seller AI` tabs are `FeaturePanel` stubs - the buyer/seller qualification flows and 1-5 lead scoring aren't built.
- **Outbound placeholders**: `Follow-Up Sequences`, `Broadcasts`, `Re-engagement`, `AI Automation Builder`, `Scheduled Messages` have no dedicated builders yet; automation creation goes through the v2 in-modal wizard.
- **Cron-side prompt integration** - `workers/cron/*` don't call `buildAgentSystemPrompt` / `logAgentActivity`; profile-prompt injection is wired only into `ai/generate/reply.ts` + `ai-agent/test-chat.ts` (not `ai/generate/improve.ts` or `ai/leads/chat.ts`).
- **Templates management UI** - the v2 `AgentV2.tsx` Templates tab is now a real per-agent `message_templates` CRUD (list/view/create/edit/delete; seeds the curated library on first visit via `POST /api/ai/templates/seed-agent-library`; create requires a `category_id`). `message_templates` are single messages, NOT multi-step sequences.
- **AI generation response shapes**: `generate/reply.ts` returns `{text}`; confirm each consumer's expected field when wiring new callers. Usage counting IS now wired (via `generateWithOpenAI`'s `orgId`).
- **Calling / voice** is a separate in-progress workstream. WebRTC + telephony run through the gateway Worker's `callActor` Durable Object ([callActor.ts](gateway-worker/src/callActor.ts)) with endpoints under [functions/api/calling/](functions/api/calling/). The fork-leg "who answered first" race is resolved by pinning every decision for a call to its single DO - D1 has no row locks, so racing the same `UPDATE ... WHERE answeredVia IS NULL` across Pages Function invocations would be fragile. Frontend cutover and Telnyx provider signature verification are not finished - see [docs/calling/](docs/calling/).
- **Budget circuit breaker** (Workers Paid spend cap + "out of runway / looking for VC" takeover) - designed but NOT built; full spec in [docs/budget-circuit-breaker.md](docs/budget-circuit-breaker.md). Measures monthly usage via the Cloudflare GraphQL Analytics API (needs a read-only token) plus internal OpenAI $ / SMS / email; over budget -> deny logins, force-logout, takeover page on login/register + stats on `/admin`, and the cron skips money-spending jobs. Plan B (no token yet) enforces OpenAI $ only; CF dimensions stay dormant until a token is added.
