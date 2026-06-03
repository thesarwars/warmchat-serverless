/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../_shared/http.ts";
import { execute, queryFirst, queryAll, nowIso } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";
import { cancelPendingFollowups } from "../../../../_shared/autoResponse.ts";
import { bulkEnrollAutomation } from "../../../../_shared/automationEnroll.ts";

// D1 caps bound parameters per statement at ~100, so any IN-list over the
// imported lead ids must be chunked - an un-chunked IN (?,?,...) over a large
// import throws "too many SQL variables" and silently aborts enrollment.
const CHUNK = 90;
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * POST /api/leads/import/:orgId/apply-ai - the explicit, manual step that
 * configures AI for a batch of leads.
 *
 * Two INDEPENDENT switches per lead:
 *   - OUTBOUND automation (automation_id): enroll into an automation's drip - queues
 *     its messages into scheduled_message (one automation per lead; any pending
 *     messages are cancelled first).
 *   - INBOUND reply (inbound_enabled): whether AI auto-replies when the lead
 *     writes back (the reactive AI Inbound Flow).
 *
 * IMPORTANT - this endpoint is NOT a mass-outbound tool. The bulk LEAD IMPORT
 * wizard intentionally calls it inbound-only (no automation_id), because a lead
 * joins an outbound workflow only when they opt in, never by mass-enrolling an
 * imported list. The automation_id path here is for the deliberate, per-lead
 * MANUAL add flows (Add Lead modal / inbox create-lead), which enroll ONE
 * consented lead at a time.
 *
 * The lead's ai_status reflects the combination:
 *   inbound on            -> 'active'
 *   automation only       -> 'outbound'   (partially enabled)
 *   neither               -> 'off'
 *
 * Body (JSON):
 *   lead_ids:        number[]          (required)
 *   enabled:         boolean           (default true) - false pauses instead
 *   automation_id:   number            (optional) - automation to enroll into
 *   inbound_enabled: boolean           (optional) - turn on AI inbound replies
 *   channel:         "sms" | "email"   (default "sms")
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const body = (await readJson<{
    lead_ids?: number[];
    enabled?: boolean;
    automation_id?: number;
    inbound_enabled?: boolean;
    channel?: string;
  }>(request)) || {};

  const leadIds = (body.lead_ids || []).filter((n) => Number.isInteger(n));
  if (!leadIds.length) return error("lead_ids is required", 400);

  const enabled = body.enabled !== false;

  const rawLeads: Array<{
    id: number; email: string | null; phone: string | null;
    sms_consent_status: string | null;
  }> = [];
  for (const part of chunk(leadIds, CHUNK)) {
    const placeholders = part.map(() => "?").join(",");
    const rows = await queryAll<{
      id: number; email: string | null; phone: string | null;
      sms_consent_status: string | null;
    }>(
      env.D1DB,
      `SELECT id, email, phone, sms_consent_status FROM lead
        WHERE id IN (${placeholders}) AND org_id = ?`,
      ...part, orgId,
    );
    rawLeads.push(...rows);
  }
  if (rawLeads.length !== new Set(leadIds).size) {
    return error("One or more leads were not found in this organization", 400);
  }

  // "Do not SMS" leads must NOT be enrolled in AI outreach - both the master
  // gate AND the suppression layer would refuse the sends anyway, but
  // skipping here keeps their visible ai_status='off' and avoids queueing
  // messages that will only be cancelled at flush time. The skipped lead
  // count is reported back so the import UI can surface "N enrolled, M
  // skipped (Do not SMS)".
  const leads = rawLeads.filter((l) => l.sms_consent_status !== "no_sms");
  const skippedNoSms = rawLeads.length - leads.length;

  const errorDetails: Array<{ lead_id: number; error: string }> = [];

  // --- Pause path: cancel any pending drip + mark leads paused. ---
  if (!enabled) {
    let errors = 0;
    for (const lead of leads) {
      try {
        await cancelPendingFollowups(env, lead.id);
        await execute(
          env.D1DB,
          `UPDATE lead SET ai_status = 'paused', updated_at = ? WHERE id = ?`,
          nowIso(), lead.id,
        );
      } catch (e) {
        errors++;
        errorDetails.push({ lead_id: lead.id, error: String((e as Error).message).slice(0, 120) });
      }
    }
    return json({ enabled: false, enrolled: 0, skipped: leads.length, errors, error_details: errorDetails });
  }

  // --- Enroll path (explicit user action; not gated by the global master). ---
  const automationId = Number(body.automation_id) || 0;
  const inboundEnabled = body.inbound_enabled === true;
  if (automationId) {
    const camp = await queryFirst<{ id: number }>(
      env.D1DB, `SELECT id FROM automation WHERE id = ? AND org_id = ?`, automationId, String(orgId),
    );
    if (!camp) return error("Automation not found in this organization", 404);
  }

  // Per-lead ai_status reflects the two switches (inbound wins for 'active').
  const aiStatus = inboundEnabled ? "active" : automationId ? "outbound" : "off";

  // Flip the visible AI status for the WHOLE batch in one statement up front, so
  // the Leads list reflects enrollment atomically.
  if (leads.length) {
    const ts = nowIso();
    for (const part of chunk(leads.map((l) => l.id), CHUNK)) {
      const ph = part.map(() => "?").join(",");
      await execute(
        env.D1DB,
        `UPDATE lead SET ai_status = ?, updated_at = ? WHERE id IN (${ph})`,
        aiStatus, ts, ...part,
      );
    }
  }

  let enrolled = 0, errors = 0;
  const skipped = skippedNoSms;
  if (automationId) {
    // Outbound drip into scheduled_message - one batched pass instead of a
    // per-lead query storm (cancels each lead's pending drip first).
    try {
      const res = await bulkEnrollAutomation(env, automationId, leads.map((l) => l.id), user.id);
      enrolled = res.enrolled;
    } catch (e) {
      errors = leads.length;
      errorDetails.push({ lead_id: 0, error: String((e as Error).message).slice(0, 120) });
    }
  } else {
    // Inbound-only enrollment: nothing to queue, the ai_status flip above is it.
    enrolled = leads.length;
  }

  return json({ enabled: true, enrolled, skipped, errors, error_details: errorDetails });
};
