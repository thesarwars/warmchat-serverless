# Budget circuit breaker - "out of runway / looking for VC" takeover (SPEC, not yet built)

**Status:** design only. A first implementation pass was written and then discarded; this doc captures the agreed design so it can be built later. Nothing in here is wired yet.

## Goal / context

We moved from Workers Free to **Workers Paid**. Paid has generous *included* baselines but then bills per-unit overage. We want to **never silently spend past the included baselines** (Workers requests/CPU, D1 rows + storage, R2 ops + storage, Durable Object requests + duration) plus the **$10/mo OpenAI credit**, and when a configured ceiling is hit, replace the auth surface with a tongue-in-cheek "we ran out of hosting runway, accepting VC term sheets" takeover that shows a **super-detailed usage report**.

## Measurement - the decision (and the dead ends)

The hard problem: Cloudflare does not push usage to your Worker, and self-counting every request/query in D1 is a paradox (the counting writes are themselves the billed resource we're trying to limit).

- **CHOSEN: Cloudflare GraphQL Analytics API**, polled by the cron every few minutes. Cloudflare already aggregates real account usage server-side, so one poll = authoritative numbers (Workers requests, CPU time, D1 rows read/written + storage, DO requests/duration) for **zero per-request cost**. The cron writes ONE flag; the request path reads it from an in-isolate cache. Endpoint: `https://api.cloudflare.com/client/v4/graphql`, `Authorization: Bearer <token>`, `viewer.accounts(filter:{ accountTag: <account id> })`.
  - Datasets: Workers `workersInvocationsAdaptive` (requests; CPU via quantiles, approximate); D1 `d1AnalyticsAdaptiveGroups` (rowsRead/rowsWritten) + `d1StorageAdaptiveGroups` (databaseSizeBytes); DO `durableObjectsInvocationsAdaptiveGroups` (requests) + `durableObjectsPeriodicGroups` (duration, best-effort). Retention ~31 days (covers a calendar month).
  - **R2 is NOT exposed** by the standard GraphQL analytics API (only R2 Data Catalog metrics) - so R2 dimensions ship disabled.
- **REJECTED: Workers Analytics Engine (WAE).** WAE *writes* are cheap (non-blocking, not D1, dodges the paradox), BUT **reading** WAE uses the SQL API (`/accounts/{id}/analytics_engine/sql`) which needs the **same `CLOUDFLARE_API_TOKEN`** (Account Analytics: Read). So it does not unblock the no-token case. And once a token exists, GraphQL already returns the *true billable* numbers (D1 rows, DO GB-s) with **zero instrumentation**, whereas WAE would only see what we manually count. Net: redundant + same token blocker. Skip it.
- **Self-counting in D1: rejected** (the paradox; D1 row-write baseline is huge but per-request writes are exactly the wrong instinct here).

### The token (and Plan B - no token yet)

The GraphQL/WAE read needs a read-only API token. As of this writing the WarmChats Cloudflare account belongs to someone else (owner unavailable), so:

- **Plan B (what to build first):** leave `CLOUDFLARE_*` blank. The breaker runs immediately on what we can measure from our own D1 with **no token**: the **OpenAI $** spend (enforced), plus optional SMS/email ceilings. The Cloudflare dimensions stay **fully wired but dormant** and render as "awaiting Cloudflare token" in the report. The day a token is pasted into one env var, they light up - **no code change**.
- **Creating the token without the owner:** Cloudflare API tokens are created under the *logged-in user's* My Profile, scoped to that user's access. `wrangler whoami` (logged in as ``) shows membership in several accounts including a `Velasquezjojo7@gmail.com's Account` (id `5b89e8d5fce043f60538d6d2cd350da5`). If you're a member of whichever account hosts WarmChats, you can mint an `Account / Account Analytics / Read` token yourself - the owner is not required. Steps: dashboard -> My Profile -> API Tokens -> Create Custom Token -> Account / Account Analytics / Read -> scope to the WarmChats account.
- **Why not just reuse wrangler's OAuth token:** it's short-lived/auto-rotated (useless as a deployed secret) and its scopes (`account:read`, `d1:write`, ... - no analytics) wouldn't authorize the analytics query anyway.

## Env configuration (all in `wrangler.toml` / `workers/cron/wrangler.toml` / `.dev.vars`)

Per-dimension: a **number enforces** that ceiling in the unit shown; **`false`/`off`/`none`/`""`/`0`/unset disables** it (not tracked, never trips). Defaults = the Paid included baselines (trips at the first overage dollar). Pages needs only the two control flags (`BUDGET_ENFORCEMENT`, `BUDGET_BLOCK_OVERRIDE`); the cron needs everything (it computes + writes the snapshot).

```
# --- Control (Pages + cron) ---
BUDGET_ENFORCEMENT      = "enforce"   # off | observe (measure + alert only) | enforce
BUDGET_BLOCK_OVERRIDE   = "auto"      # auto | on (force takeover - preview) | off (emergency disable)
BUDGET_TRIP_PERCENT     = "100"       # trip when an enabled dimension reaches this % of its limit
BUDGET_WARN_PERCENT     = "80"        # alert site admins when a dimension crosses this %
BUDGET_POLL_MINUTES     = "10"        # cron poll cadence (CF analytics lag a few min anyway)
# --- Cloudflare Analytics (cron only; blank = Plan B) ---
CLOUDFLARE_ACCOUNT_ID   = ""
CLOUDFLARE_API_TOKEN    = ""          # Account Analytics: Read
# --- Cloudflare platform dimensions (need the token) ---
BUDGET_WORKERS_REQUESTS = "10000000"      # requests/month
BUDGET_WORKERS_CPU_MS   = "30000000"      # CPU-ms/month
BUDGET_D1_ROWS_READ     = "25000000000"   # rows/month
BUDGET_D1_ROWS_WRITTEN  = "50000000"      # rows/month
BUDGET_D1_STORAGE_GB    = "5"             # GB
BUDGET_R2_STORAGE_GB    = "false"         # R2 not in GraphQL - disabled
BUDGET_R2_CLASS_A       = "false"
BUDGET_R2_CLASS_B       = "false"
BUDGET_DO_REQUESTS      = "1000000"       # requests/month
BUDGET_DO_DURATION_GBS  = "400000"        # GB-s/month
# --- Internal dimensions (no token needed) ---
BUDGET_OPENAI_USD       = "10"            # USD/month, all orgs (from usage.ai_requests x ~$0.0015/req)
BUDGET_SMS_SEGMENTS     = "false"         # optional; off by default
BUDGET_EMAILS_SENT      = "false"         # optional; off by default
```

## Takeover behavior (agreed UX)

- **Public marketing/home route (`/` = `<Index/>`) is left alone** - never taken over.
- **Login + Register pages**: on mount, fetch the budget status; when over budget, render the "looking for VC" takeover **in place of the form** with the exact, super-detailed usage report (every dimension: used / limit / % bar, tripped one highlighted, disabled shown as "no limit", CF dims as "awaiting token"), the month, and the reset date. **Logins are denied** (the auth endpoints also return the block).
- **Logged-in app**: a **deferred, non-blocking** check runs *after the dashboard paints* (via `requestIdleCallback`, like the existing integrations-ready defer in `MainLayout.tsx`); when over budget it **force-logs-out** and redirects to `/login` (which shows the takeover). The dashboard's first paint is never blocked.
- **`/admin`** (`AdminHome.tsx`): append the detailed budget/usage stats at the bottom.
- Compliance, no emojis, ASCII punctuation only; WarmChats branding via `public/favicon.svg` / `public/icon.png`.

## Enforcement layers

1. **Cron (biggest autonomous spender):** add a `budgetWatch` job (poll + compute + persist flag, self-throttled to `BUDGET_POLL_MINUTES`, fail-open). Run it first each tick, then read `isBudgetExceeded` and **skip the money-spending jobs** (`scheduledMessages`, `sequenceDispatch`, `escalationAdvance`) while over budget - leave their rows queued so they resume next month. Keep `gmailTokenRefresh` / `appointmentReminders` / `cleanup` running (cheap/critical).
2. **Auth (deny new sessions - cheapest chokepoint):** in `auth/login.ts`, `auth/register.ts`, `auth/google-login.ts`, when enforced + exceeded, return HTTP 200 with `{ code: "BUDGET_EXCEEDED", report }` (the 200+code convention used for `QUIET_HOURS`, keeps CF error logs clean).
3. **Spend endpoints (defense in depth):** a `budgetGate(env)` guard beside the existing `checkUsageLimit` calls in the outbound paths (`messages/send.ts`, `inbox/send.ts`, `inbox/send/reply.ts`, `automations/send/[automationId].ts`, the AI entry points `ai-agent/test-chat.ts` + `ai/generate/reply.ts`). Catches a lingering valid cookie before its deferred logout fires.

## Files (to create / modify when building)

**New**
- `functions/_shared/budget.ts` - shared types + `parseLimit()` (null = disabled), `BUDGET_DIMENSIONS`, `readBudgetStatus(env)` (in-isolate ~60s cache), `isBudgetExceeded(env)` (honors override + enforcement mode), `budgetGate(env)`.
- `workers/cron/_shared/budget.ts` - parallel copy + `computeAndStoreBudgetStatus(env, raw, {cloudflareConnected})` + `monthKey`/`monthResetIso`.
- `workers/cron/_shared/cloudflareAnalytics.ts` - the GraphQL client (fail-open; per-dataset queries; converts bytes->GB, microseconds->ms).
- `workers/cron/jobs/budgetWatch.ts` - throttle, query CF (if token), add internal OpenAI $/SMS/email from `usage`, compute, persist, one-shot admin warn/trip alert via `notify()`.
- `functions/api/system/budget.ts` - public, cheap GET returning the report snapshot for the takeover + deferred check.
- `src/pages/BudgetTakeover.tsx` - the gag page + detailed report table.
- `src/helpers/budget.ts` - `fetchBudgetStatus()` / `useBudgetStatus()`.

**Modified**
- `workers/cron/index.ts` - register `budgetWatch`; skip-guard the spend jobs.
- `workers/cron/env.ts` + `functions/_shared/env.ts` - type the new vars.
- `auth/{login,register,google-login}.ts` - deny + return report when exceeded.
- the spend endpoints above - add `budgetGate`.
- `src/components/Login.tsx`, `src/components/SignUp.tsx` - render `<BudgetTakeover/>` when exceeded.
- `src/components/MainLayout.tsx` - deferred force-logout check.
- `src/components/admin/AdminHome.tsx` - budget stats at the bottom.
- `wrangler.toml`, `workers/cron/wrangler.toml`, `.dev.vars`, `workers/cron/.dev.vars` - the env block.

**No DB schema change** - reuses the generic `app_settings` table (`budget_status` JSON snapshot, `budget_exceeded`, `budget_last_poll`, `budget_notify_warn`/`budget_notify_trip` month-stamps). No `sql/*.sql` edit, no reseed.

## Reuse (don't re-derive)
- `getAppSetting`/`setAppSetting` (`functions/_shared/appSettings.ts` + cron copy) - system-wide row via `orgId = null`.
- `notify()` for admin alerts (one-shot stamp pattern from `quotaNotify.ts`).
- `usage` table for OpenAI $ / SMS / email; AI unit cost `0.0015` (mirror `functions/api/ai/agents/index.ts`).
- 200+`code` block convention (mirrors `QUIET_HOURS` in `messages/send.ts`).
- Frontend forced-logout via `clearStoredAuthState()` + the deferred `requestIdleCallback` pattern in `MainLayout.tsx`.

## Verification (when built)
1. `pnpm lint` + `pnpm build` green.
2. Preview without spending: `BUDGET_BLOCK_OVERRIDE = "on"` -> `/login` + `/register` show the takeover; app force-logs-out; public `/` stays normal. Reset to `"auto"`.
3. Disable a dimension: set one to `"false"` -> `/api/system/budget` shows "no limit", it can't trip.
4. Cron: `pnpm dev-cron` + `pnpm cron:trigger` -> `[cron:budgetWatch]` logs, `budget_status` written; with override on, spend jobs log "skipped".
5. With a real token: confirm CF dimensions show real numbers matching the dashboard order of magnitude.

## Risks / notes
- GraphQL dataset/field names + the CPU-ms approximation (quantiles, microseconds) should be verified against the live account on first poll; disable any dimension that won't resolve via its env switch.
- CF analytics lag a few minutes - acceptable; set `BUDGET_TRIP_PERCENT` < 100 for headroom.
- Fail-open everywhere: a missing token or a transient query failure must never trip the site; `BUDGET_ENFORCEMENT="observe"` lets it run a month measuring/alerting before `"enforce"`.
- Compliance: inbound webhooks (Telnyx/ElasticEmail) + STOP handling must NOT be gated - keep receiving inbound even when over budget.
