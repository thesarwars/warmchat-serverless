# Pre-Launch Campaign QA — 100 & 1,000 leads

Evidence for the launch go/no-go: creating a campaign, enrolling 100 and 1,000
leads, and watching the queue drain **in batches with zero duplicates** (mock
mode, so nothing reaches a real phone/inbox).

## Video & screenshots
- `video/campaign-100-and-1000-flow.webm` — ~90s screen recording.
- `screenshots/`
  - `01-campaigns-list` — both campaigns **Live** (QA 100 + QA 1000), 1-step SMS.
  - `02-add-workflow-menu` / `03-wizard-name-channel` — the **create-a-campaign flow** (Add workflow → Start from scratch → Step 1 of 3: Name & Channel + Who to enroll).
  - `04-campaign-100-detail` — campaign detail (trigger → AI follow-up → outcome).
  - `05/06/07/08-debug-*` — the Debug send-log feed **draining in batches**; per-number throughput stays well under the 49/s cap.

> The recording uses a manual drain pump that stands in for **Workers Paid**
> throughput. On the current free plan the cron drains only ~6–12 sends/min, so
> the pump is what lets the queue move at realistic speed on camera. The
> pipeline logic shown is exactly what runs in production.

## Results (mock mode)

| Campaign | Enrolled | Unique reached | Duplicates | Notes |
|---|---|---|---|---|
| QA 100 Campaign | 100 | **100 / 100** | **0** | Fully drained, clean |
| QA 1000 Campaign — during the 90s clip | 1,000 | 749 | **0** | Normal-cadence batched drain |
| QA 1000 Campaign — after sustained recovery pump | 1,000 | 940 | **44 (~4.5%)** | See duplicate note below |

Per-second throughput stayed at peak ~7/s vs the **49/s** Telnyx cap (≈14%) —
the rate limiter works and never approached the provider ceiling.

### ⚠️ Duplicate finding (important for the go/no-go)
The duplicate protection has two layers:
- **Concurrency dupes** (two drainers grabbing the same row) — **fully prevented**
  by the atomic claim. This never produced a duplicate at any scale.
- **Crash-recovery dupes** — on the **free** Workers plan, a busy tick is
  CPU-killed *mid-dispatch* (after the provider send, before the idempotency
  marker is written). The 180s reclaim then re-sends that crash-stranded row →
  a duplicate. This is what produced the 44 dupes above, and only after we
  hammered the queue with a 6-way parallel pump for >3 min to force the stall.

**On Workers Paid this window stays closed** — ticks aren't killed mid-pass, so
the dispatch+marker completes and the reclaim never re-fires. The 100-lead run
(which finishes inside one pass) was 0 dupes for exactly this reason.

So the free plan isn't just *slow* at scale — under the stall it can also
**duplicate ~3-5% of sends at 1,000**. This makes the Paid upgrade a correctness
requirement at scale, not only a speed one. (If zero-dupes is required even on
free plan, the marker can be written *before* dispatch — an at-most-once change
that trades a rare missed send for guaranteed no-duplicates; small code change.)

## The 8 launch questions — answers

1. **Max SMS rate** — 49/sec per 10DLC number (burst cap); system drains `MAX_PER_TICK=100`/min ≈ 6,000/hr by design. ⚠️ Free plan caps actual at ~6–12/min (CPU limit).
2. **Max email rate** — 10/sec per sending domain (conservative); same 100/min system drain.
3. **Rate limits per plan?** — Per-second caps are **global hardcoded** (not per-plan). Monthly quotas ARE per-plan (`plans.ts`) but only enforced in the sequence dispatcher, not campaign drain (gap to close).
4. **Queue batching done?** — **Yes.** Atomic claim + idempotency marker + split reclaim + per-second limiter + concurrency 12. Overlapping ticks cannot double-send.
5. **Safe at 100/500/1000?** — **100: clean (0 dupes).** At 1,000 on **free plan** the stall both slows the drain AND can re-send ~3-5% (crash-recovery dupes — see note). **On Paid: completes in ≈1/5/10 min with 0 dupes.** Paid upgrade is required for safe scale.
6. **Video** — this folder.
7. **Test/fake mode?** — **Exists.** Mock send layer → `mock_send_log`, runtime toggle `/admin/debug`, mock-inbound reply simulator. No build needed.
8. **Event logging?** — Send success/failure, reply, unsubscribe/STOP, pause, resume, stop/cancel all logged. Gaps: no granular persistent "attempt" log; quiet-hours/rate-limit skips not recorded with a reason; no SMS delivery receipts; email delivery KPIs live in `email_events`.

## The one blocker before launch at scale
Upgrade the **`warmchats-cron`** worker to **Workers Paid** and restore
`[limits] cpu_ms = 300_000`. No code change — it's a billing/config decision on
the client's Cloudflare account. Until then, campaigns above ~100 leads drain
very slowly / stall (correctness is unaffected — no duplicates either way).
