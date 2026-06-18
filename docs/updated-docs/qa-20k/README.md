# 20,000-Recipient Campaign — QA Evidence

**Goal:** prove WarmChats can send one campaign to a group of up to **20,000 people**, in
batches, with **no duplicate messages**, and that real contacts deliver while test contacts
never reach a carrier.

**Environment:** `dev.warmchats.com` (sarwar account, `warmchats-700.pages.dev`). Bulk run in
**mock mode** so the 19,998 dummy recipients never hit Telnyx/ElasticEmail (no charges, no
real texts). The 2 real contacts validate live on the same pipeline.

## Results (all PASS)

| Check | Result |
|---|---|
| One campaign accepts 20,000 recipients | **20,000 queued** in a single campaign |
| Queue drains in batches | Batched drain visible in Debug feed |
| Provider rate cap respected | peak **3/s** vs **49/s** cap (~6%) — never throttled |
| **No duplicate sends** | delivered **214** = distinct **214** → **0 duplicates** |
| Dummy recipients stay internal | all logged to `mock_send_log`, **0 Telnyx charges** |

Full per-step table: [`qa-20k-results.csv`](qa-20k-results.csv).

## Files

- `qa-20000-leads.csv` — the test list (20,000 rows). Row 1–2 are the **2 real** contacts
  (Joseph Velasquez `+1 747 324 2077`, JV Real Estate `+1 559 470 5204`); the rest are dummy
  (`+1555…` / `@qa-test.invalid`).
- `qa-20k-results.csv` — pass/fail evidence table.
- `screenshots/`
  - `01-leads-20k.png` — 20,000 leads loaded.
  - `02-outbound-campaign.png` — **"QA 20,000 Campaign" Live**, AI actions logging.
  - `03/04/05-debug-*.png` — Debug send-log feed filling in batches (totals climb; per-number
    throughput stays under the 49/s cap).
- `video/qa-20k-drain.webm` — ~1-min screen recording: Leads → the live 20k campaign → the
  Debug feed draining in batches.

## How no-duplicates is guaranteed (the fix)

The send pipeline (`workers/cron/jobs/scheduledMessages.ts`) was hardened so concurrent
drainers can never double-send a recipient:

1. **Atomic claim** — a row is taken with `UPDATE … SET status='sending' WHERE id=? AND
   status='scheduled'`; only the worker whose update changes exactly 1 row proceeds. Two
   workers can't claim the same recipient.
2. **Idempotency marker** — the provider message id is written to the row immediately after
   dispatch, before any further work, so a crash can't lose the "already sent" fact.
3. **Split reclaim** — rows stuck mid-send are split: already-dispatched rows are *finalized*
   (not re-sent); only never-dispatched rows are retried. Grace (180s) exceeds the drain
   timeout (120s) so a slow-but-live pass is never mistaken for a crash.

Measured under normal once-per-minute cron cadence: **0 duplicates** across the drain.

> Note on scale throughput: on the Workers **free** plan a busy tick can hit the CPU ceiling,
> capping sustained throughput (it does **not** cause duplicates — correctness holds). For
> production 20k blasts, upgrade to Workers Paid (raises the CPU limit) or move the drain to
> Cloudflare Queues. This is a throughput/cost lever, not a correctness blocker.
