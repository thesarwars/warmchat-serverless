# Outbound Campaign QA — Results

**Environment:** dev (`warmchats-700` / monsieur.sarwar account), org 1 "Demo Realty".
**Method:** mock mode scoped to org 1 only (org 2 Velasquez + org 3 untouched), 1000 fake
opted-in leads (fake `+1555…` numbers + `…@qa-test.invalid` emails), enrolled via the real
`POST /api/automations/:id/enroll` path and drained by the **real production cron** (every minute).
All sends were intercepted to `mock_send_log` — **nothing reached Telnyx/email**.
All QA data + the per-org mock flag were removed afterward; org 1 is back to live.

---

## TL;DR

The sandbox/test mode already exists and works. Stop-on-reply, STOP/unsubscribe, pause/resume,
opt-out suppression, AI inbound replies, and the email path all behave correctly. **But the
send pipeline does NOT reliably deliver bulk campaigns at scale today** — a 500-lead campaign
**stalled at ~78% delivered and never finished**, and produced a small number of **duplicate
sends**. Root cause: the cron worker is on the **free Workers plan**, so each per-minute
invocation hits its CPU ceiling after ~6–12 sends and is killed mid-pass; stranded rows are
then re-sent (duplicates) and block the rest of the queue (stall). **Campaigns are not safe for
500/1000 until this is fixed.**

---

## What was validated

| Requirement (from the request) | Result | Evidence |
|---|---|---|
| Test/sandbox mode (queue, process, log, no real send) | ✅ Works | Mock mode; `mock_send_log`; records + statuses still update |
| Queue created correctly | ✅ | enroll N → exactly N `scheduled_message` rows (verified 100/500/1000) |
| Messages send in batches, not all at once | ✅ (by design) | `MAX_PER_TICK=100`, concurrency 12, per-minute cron |
| Delivery statuses update | ✅ | `scheduled → sending → sent` observed |
| **No duplicate sends** | ❌ **Fails at scale** | 100 leads: 101 sends / 100 distinct (1 dupe). 500: 396 / 393 (3 dupes) |
| **All leads receive the message** | ❌ **Fails at scale** | 500-lead run **stalled at 389/500 sent**, never completed |
| Lead only gets one message at a time | ✅ | opening + follow-ups are separate dated rows; one due at a time |
| Replies remove lead from campaign | ✅ | reply → all pending rows `cancelled` (stop-on-reply) |
| STOP unsubscribes immediately | ✅ | STOP → `sms_opt_out=1`, `opted_out`, pending cancelled |
| Campaign pause / resume / stop | ✅ | `Running → Paused → Running`; cron skips Paused rows |
| AI responds to replies | ⚠️ Partial | works for inbound/new leads; **campaign recipients excluded by design** (see F4) |
| Email queue / send / status | ✅ (small scale) | 5 → 5 sent, mock emails logged, personalized |
| Email no-duplicates | ✅ (small scale) | 5 sends / 5 distinct |
| **Mixed SMS+Email in one campaign** | ❌ **Not supported** | a campaign is single-channel (see F5) |
| Failed messages logged, campaign continues | ⚠️ Couldn't force a provider failure in mock (mock always succeeds); opt-out path correctly cancels one row while others proceed |

---

## Critical findings

### F1 — Cron throughput collapses; bulk campaigns stall (LAUNCH BLOCKER)
The drain worker processes only **~6–12 messages per minute** then stops. Proof from
`send_rate_counter` (one bucket per tick, 60s apart): counts of 6, 0, 10, 12, 12 — far below the
49/sec limit, so it is **not** rate-limiting; the invocation is being **killed mid-pass by the
free-plan CPU limit**. (`workers/cron/wrangler.toml` itself notes the paid-only `cpu_ms` block was
removed because the account is on the free plan, and that CPU timeouts were stranding rows.)
- 100 leads (clean queue): fully delivered.
- **500 leads: stalled permanently at 389/500 (78%)** — 111 rows never sent.
- 50 leads (with a pre-existing stuck backlog): stalled at ~32/50.

### F2 — Duplicate sends (no atomic claim + reclaim re-dispatch)
A row is claimed with `UPDATE … SET status='sending' WHERE id=?` — **not** guarded by
`AND status='scheduled'` ([scheduledMessages.ts:287](../../workers/cron/jobs/scheduledMessages.ts#L287)).
When an invocation is cut off after dispatch but before the `sent` write, the row is stranded in
`sending`; 90s later the reclaim ([scheduledMessages.ts:112](../../workers/cron/jobs/scheduledMessages.ts#L112))
flips it back to `scheduled` and it is **dispatched again** — there is no send-level idempotency
(the "idempotent" comment only covers the inbox row, not the provider send). Observed: 1 dup at
100 leads, 3 at 500. Concurrent cron runs (e.g. a tick overrunning 60s) hit the same race.

### F3 — Head-of-line blocking
The due query is `ORDER BY scheduled_at ASC LIMIT 100`. Stuck rows from an unfinished campaign are
the oldest, so every tick re-pulls and re-fails them, **starving newer campaigns**. One stalled
campaign can wedge all others.

### F4 — AI does not auto-reply to campaign recipients (by design — confirm intent)
[autoResponse.ts:88-94](../../functions/_shared/autoResponse.ts#L88): a lead with
`ai_status='outbound'` (i.e. currently in a campaign) is intentionally excluded from AI
auto-replies. So the request's "AI Bulk Reply Test" (campaign leads reply → AI responds) will
**not** happen by default — those replies are left for a human. Inbound/new leads DO get AI
replies (verified: a clean lead's reply produced a correct queued AI response).

### F5 — Mixed-channel campaigns not supported
A follow-up step has no `channel` field and the drip channel is computed once for the whole
automation ([automationEnroll.ts](../../functions/_shared/automationEnroll.ts)). "Day 1 SMS →
Day 2 email → Day 3 SMS" is not achievable; each campaign is single-channel.

### Minor
- Email `subject` is not stored in `mock_send_log` (cosmetic; body + recipient are correct).
- Rate limits are a global constant (`DEFAULT_RATE_LIMITS`), not configurable per account/plan.
- A true provider "failed" status can't be exercised in mock mode (mock always succeeds).

---

## Answers to the 7 questions

1. **Max SMS rate:** *Designed* 100/min (`MAX_PER_TICK`), capped by 49/sec/number. *Actual today*
   ~6–12/min before the free-plan CPU cutoff, degrading to a stall.
2. **Max email rate:** *Designed* 100/min, 10/sec/domain. *Actual* same CPU-bound ceiling.
3. **Configurable per account/plan?** No — global constant. (Gap.)
4. **Queue batching already implemented?** Yes — `scheduled_message` + cron, batch inserts of 50,
   concurrency 12, per-second limiter. Solid design; throughput is gated by the plan, not the design.
5. **Safe for 100 / 500 / 1000?** **No, not currently.** 100 mostly delivers (~1% dup); 500
   stalled at 78%; 1000 worse. Needs the F1/F2/F3 fixes first.
6. **Fake/test mode exists?** **Yes — already built.** Per-org/system/env mock toggle, records +
   statuses preserved, `mock_send_log`, `mock-inbound` reply simulator, admin Debug viewer.
7. **Logs every event?** Mostly. Sends/failures → `mock_send_log` + `ai_activity_log` +
   `scheduled_message` status; replies → conversation + `lead.replied`; opt-outs → `sms_contact`/
   `lead` flags. Pause/resume/stop change `automation.status` but aren't in a single audit feed.

---

## Recommended fixes (priority order)

1. **Move the cron worker to a paid Workers plan** and restore `[limits] cpu_ms` (fixes F1 — the
   single biggest blocker). The client's production account may already be paid; verify before cutover.
2. **Atomic claim:** `UPDATE … SET status='sending' WHERE id=? AND status='scheduled'`; only
   dispatch when `changes==1` (fixes the F2 race).
3. **Send-level idempotency:** never re-dispatch a row that already has a provider/mock send
   recorded (makes reclaim safe).
4. **Lower `MAX_PER_TICK` to real per-invocation capacity, or move sending to Cloudflare Queues**
   (removes per-tick CPU cliff + F3 head-of-line blocking).
5. **Decide F4 product behavior** (should campaign replies be picked up by AI?) and F5 (per-step
   channel for mixed campaigns) — or document both as intended limitations.
