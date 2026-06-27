/// <reference types="@cloudflare/workers-types" />
/**
 * Stale-call sweep. A call row should reach a terminal status when its Telnyx
 * `call.hangup` webhook lands. If that webhook is ever missed/mismatched, the row
 * sticks at RINGING / IN_PROGRESS forever - which (a) leaves a phantom "active
 * call" in the UI and (b) lets the busy-on-busy guard auto-drop the agent's NEXT
 * call. Nothing else cleans these up, so finalize them here as a backstop.
 *
 * Thresholds are deliberately generous so a genuine long call is never cut off:
 *   - RINGING / INITIATED unanswered for > 5 min  -> never connected (NO_ANSWER).
 *   - IN_PROGRESS for > 2 hours                    -> a missed hangup (COMPLETED).
 * (A web leg's WebRTC token expires at ~50 min, so a real web call can't reach 2h;
 *  2h leaves ample room for the longest plausible PSTN call.) datetime() parses
 * both ISO and CURRENT_TIMESTAMP values; an unparseable value yields NULL and is
 * left untouched (fail safe). Status/duration are not back-billed - the lost
 * minutes of a phantom call are an acceptable, conservative under-count.
 */
import type { CronEnv } from "../env.ts";

export async function runStaleCalls(env: CronEnv): Promise<void> {
  const now = new Date().toISOString();

  // 1) Never-answered rings left hanging.
  try {
    const r = await env.D1DB.prepare(
      `UPDATE calls SET status = 'NO_ANSWER', completed_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE status IN ('RINGING', 'INITIATED')
          AND datetime(COALESCE(ringing_at, initiated_at, created_at)) < datetime('now', '-5 minutes')`,
    ).bind(now).run();
    const n = Number(r.meta?.changes ?? 0);
    if (n > 0) console.log(`[staleCalls] finalized ${n} stuck RINGING/INITIATED call(s) -> NO_ANSWER`);
  } catch (err) {
    console.warn("[staleCalls] ringing sweep failed", err);
  }

  // 2) Answered calls whose hangup webhook never landed.
  try {
    const r = await env.D1DB.prepare(
      `UPDATE calls SET status = 'COMPLETED', completed_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE status = 'IN_PROGRESS'
          AND datetime(COALESCE(answered_at, updated_at, initiated_at)) < datetime('now', '-2 hours')`,
    ).bind(now).run();
    const n = Number(r.meta?.changes ?? 0);
    if (n > 0) console.log(`[staleCalls] finalized ${n} stuck IN_PROGRESS call(s) -> COMPLETED`);
  } catch (err) {
    console.warn("[staleCalls] in-progress sweep failed", err);
  }
}
