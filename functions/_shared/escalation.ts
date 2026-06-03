/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst, execute, nowIso } from "./db.ts";

/**
 * Hot-lead escalation ladder (docs/automations-ai-flow/biggest-differentiator.md:
 * "WarmChats should be obsessed with making sure hot leads never get ignored").
 *
 * When the reactive flow detects booking/ready intent it opens ONE open
 * lead_escalation row per lead at level 1. A cron pass (workers/cron) advances
 * the level on each next_alert_at: 1 = in-app, 2 = SMS to the agent, 3 = push /
 * email, repeating every 15 minutes until resolved. Resolution happens when the
 * agent replies, an appointment is booked, the lead opts out, or the agent
 * pauses AI for the lead. These helpers are the open/resolve side (Pages); the
 * cron owns the level-advance side.
 */

/** Minutes between escalation alerts when the agent has not yet responded. */
export const ESCALATION_INTERVAL_MIN = 15;

function nextAlertIso(fromMs: number = Date.now()): string {
  return new Date(fromMs + ESCALATION_INTERVAL_MIN * 60_000).toISOString();
}

/**
 * Open a hot-lead escalation if the lead has no open one already (one open row
 * per lead - re-detecting the same intent should not stack alerts). Starts at
 * level 1 with next_alert_at set so the cron can escalate if ignored.
 */
export async function openEscalation(
  env: Env,
  opts: { orgId: number; leadId: number; ownerId?: number | null; reason: string; detail?: string | null },
): Promise<void> {
  const existing = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM lead_escalation WHERE lead_id = ? AND status = 'open' LIMIT 1`,
    opts.leadId,
  );
  if (existing) return;
  await execute(
    env.D1DB,
    `INSERT INTO lead_escalation (org_id, lead_id, user_id, reason, detail, level, status, next_alert_at)
     VALUES (?, ?, ?, ?, ?, 1, 'open', ?)`,
    opts.orgId, opts.leadId, opts.ownerId ?? null, opts.reason, opts.detail ?? null, nextAlertIso(),
  );
}

/**
 * Resolve every open escalation for a lead (agent stepped in / booked / opted
 * out). Idempotent - a no-op when nothing is open.
 */
export async function resolveLeadEscalations(
  env: Env,
  leadId: number,
  reason: string,
): Promise<void> {
  await execute(
    env.D1DB,
    `UPDATE lead_escalation SET status = 'resolved', resolved_at = ?, resolved_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE lead_id = ? AND status = 'open'`,
    nowIso(), reason, leadId,
  );
}
