/// <reference types="@cloudflare/workers-types" />
/**
 * Per-number pacing for AI-initiated SMS.
 *
 * Carriers flag *velocity + repetition* to a single handset as spam (Telnyx
 * error 40002 "Blocked as spam - temporary"). To avoid ever tripping that, we
 * cap how fast / how many AI texts go to one number:
 *   - a minimum gap between consecutive AI texts to the same number, and
 *   - a soft rolling-hour ceiling per number.
 *
 * Over-paced sends are NOT dropped - callers queue them to `scheduled_message`
 * at `nextAtIso` so the cron sends them once the number cools down.
 *
 * Counting is based on the AI outbound history in `sms_message`
 * (direction='outbound', sent_by_ai=1) so it needs no extra table. Only AI
 * sends are counted/capped; agent + automation sends are out of scope.
 *
 * Uses the raw D1 API so the identical file works in both the Pages Functions
 * (functions/_shared) and the cron worker (workers/cron/_shared).
 */

/** Minimum spacing between AI texts to the same number (ms). */
export const AI_SMS_MIN_GAP_MS = 30_000; // 30s
/** Max AI texts to the same number within a rolling hour. */
export const AI_SMS_HOURLY_CAP = 10;

export interface PaceResult {
  /** True -> send now. False -> defer until nextAtIso. */
  ok: boolean;
  /** ISO time the number is next allowed to receive an AI text (when !ok). */
  nextAtIso?: string;
}

interface PaceRow {
  cnt: number | null;
  last_at: string | null;
  first_at: string | null;
}

/**
 * Decide whether an AI SMS to `phone` may go out now. Returns {ok:true} to
 * send, or {ok:false, nextAtIso} to hold it for the cron.
 */
export async function checkAiSmsPace(
  db: D1Database, orgId: number, phone: string,
  nowMs: number = Date.now(),
): Promise<PaceResult> {
  if (!phone) return { ok: true };
  const sinceIso = new Date(nowMs - 3_600_000).toISOString();
  const row = await db.prepare(
    `SELECT COUNT(*) AS cnt, MAX(m.created_at) AS last_at, MIN(m.created_at) AS first_at
       FROM sms_message m
       JOIN sms_conversation c ON c.id = m.conversation_id
       JOIN sms_contact ct ON ct.id = c.contact_id
      WHERE ct.org_id = ? AND ct.phone_number_e164 = ?
        AND m.direction = 'outbound' AND m.sent_by_ai = 1
        AND m.created_at > ?`,
  ).bind(orgId, phone, sinceIso).first<PaceRow>();

  const cnt = Number(row?.cnt ?? 0);
  let nextMs = 0;

  // Minimum gap since the last AI text to this number.
  if (row?.last_at) {
    const lastMs = Date.parse(row.last_at);
    if (Number.isFinite(lastMs) && nowMs - lastMs < AI_SMS_MIN_GAP_MS) {
      nextMs = Math.max(nextMs, lastMs + AI_SMS_MIN_GAP_MS);
    }
  }
  // Rolling-hour ceiling: defer until the oldest message in the window ages out.
  if (cnt >= AI_SMS_HOURLY_CAP && row?.first_at) {
    const firstMs = Date.parse(row.first_at);
    if (Number.isFinite(firstMs)) nextMs = Math.max(nextMs, firstMs + 3_600_000);
  }

  if (nextMs > nowMs) return { ok: false, nextAtIso: new Date(nextMs).toISOString() };
  return { ok: true };
}
