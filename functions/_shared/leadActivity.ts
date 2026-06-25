/// <reference types="@cloudflare/workers-types" />
import { execute } from "./db.ts";

/**
 * Bump lead.last_activity_at to `tsIso` - MONOTONIC: never lowers an existing
 * value, so out-of-order writes (a backfilled older message, a delayed send) can
 * never push a contact back down the inbox list. No-ops on a null leadId (inbound
 * from an unknown sender, sends to a non-lead address).
 *
 * Call this with the SAME timestamp written to the message row (message_date ||
 * created_at) at every message INSERT site, so a lead's recency in the inbox
 * contacts list reflects its newest message immediately.
 */
export async function bumpLeadActivity(
  db: D1Database,
  leadId: number | null | undefined,
  tsIso: string,
): Promise<void> {
  if (!leadId || !tsIso) return;
  try {
    await execute(
      db,
      `UPDATE lead SET last_activity_at = ?
        WHERE id = ? AND (last_activity_at IS NULL OR last_activity_at < ?)`,
      tsIso, leadId, tsIso,
    );
  } catch {
    // Best-effort recency hint - a failure here must never break the send/receive
    // path. The reconcile cron (and the address-match read fallback) self-heal it.
  }
}
