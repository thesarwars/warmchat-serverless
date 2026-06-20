/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, queryAll, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { bulkEnrollAutomation } from "../../../_shared/automationEnroll.ts";
import { MAX_AUTOMATION_LEADS, safeJson } from "../../../_shared/automationHelpers.ts";

/**
 * POST /api/automations/:id/enroll - enroll the leads matching an audience into
 * this automation's outbound drip. This is what "Start workflow" actually does:
 * the wizard only CREATES the automation definition, and that alone never texts
 * anyone. Enrollment is the step that queues each lead's opening message + its
 * follow-ups into `scheduled_message` - the single compliance-guarded outbound
 * queue. Quiet hours, the per-second rate limit, STOP/suppression AND the
 * master + Outbound AI gate are all enforced at send time by the cron, so
 * enrolling never bypasses a compliance control (the SEND stays gated; only the
 * QUEUE happens here).
 *
 * Idempotent / anti-stacking: a lead already sitting in THIS automation's queue
 * (a pending scheduled_message tagged with this automation_id) is skipped, so
 * clicking "Start" twice - or re-launching, or an overlapping audience - never
 * re-blasts the opening to a lead who has not replied yet. A reply cancels the
 * lead's pending drip (stop-on-reply, handled in inbound processing), which is
 * what lets the program wind down instead of piling on un-answered messages.
 *
 * Body: { audience?: "all" | "buyer" | "seller" | "new", lead_ids?: number[] }
 *   audience  - resolved to a lead set; defaults to the automation's stored source.
 *   lead_ids  - explicit override (validated to the org); wins over audience.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const automationId = Number(params.id);
  if (!Number.isInteger(automationId)) return error("Invalid automation id", 400);

  const camp = await queryFirst<{ org_id: string; channels: string | null; sources: string | null }>(
    env.D1DB,
    `SELECT org_id, channels, sources FROM automation WHERE id = ? AND is_archived = 0`,
    automationId,
  );
  if (!camp) return error("Automation not found", 404);
  const orgId = Number(camp.org_id);
  if (!Number.isInteger(orgId) || !(await isOrgMember(env, user.id, orgId))) {
    return error("Forbidden", 403);
  }

  const body = (await readJson<{ audience?: string; lead_ids?: number[] }>(request)) || {};

  // Channel decides which contact field + suppression flag is required: an SMS
  // automation needs a phone that has not opted out; an email one needs an
  // address that has not opted out. (Mirrors firstChannel in automationEnroll.)
  const chans = safeJson<string[]>(camp.channels, []);
  const channel = (chans[0] || "").toLowerCase() === "email" ? "email" : "sms";
  // NB: COALESCE the consent column - a freshly imported/created lead has
  // sms_consent_status = NULL, and `NULL != 'no_sms'` is NULL (not true) in
  // SQLite, which silently EXCLUDED every such lead from enrollment. Only an
  // explicit "no_sms" should be suppressed (mirrors bulkEnrollAutomation, which
  // suppresses on `=== 'no_sms'`, not on unknown/NULL).
  const contactClause = channel === "email"
    ? "email IS NOT NULL AND email != '' AND COALESCE(email_opt_out, 0) = 0"
    : "phone IS NOT NULL AND phone != '' AND COALESCE(sms_opt_out, 0) = 0 AND COALESCE(sms_consent_status, '') != 'no_sms'";

  // Explicit lead_ids win; otherwise fall back to the wizard audience, then the
  // automation's stored source. Audiences map onto the same columns the wizard's
  // counts use (lead_type for buyer/seller, status for new).
  const explicitIds = (body.lead_ids || []).filter((n) => Number.isInteger(n));
  const audience = (body.audience || safeJson<string[]>(camp.sources, [])[0] || "all").toLowerCase();

  let audClause = "";
  const audParams: unknown[] = [];
  if (!explicitIds.length) {
    if (audience === "buyer") { audClause = "AND lead_type LIKE ?"; audParams.push("%buyer%"); }
    else if (audience === "seller") { audClause = "AND lead_type LIKE ?"; audParams.push("%seller%"); }
    else if (audience === "new") { audClause = "AND status LIKE ?"; audParams.push("%new%"); }
  }

  // Candidate leads: right org + a usable, non-opted-out contact for the channel,
  // not explicitly paused for AI, matching the audience, and NOT already pending
  // in this automation's queue (the anti-stacking guard). When an explicit id list
  // is given it is chunked at 90 (D1 caps bound params per statement at ~100), so
  // a large bulk selection no longer throws "too many SQL variables".
  const runCandidates = async (idClause: string, idParams: unknown[]) =>
    queryAll<{ id: number }>(
      env.D1DB,
      `SELECT id FROM lead
         WHERE org_id = ?
           AND ${contactClause}
           AND (ai_status IS NULL OR ai_status != 'paused')
           ${audClause}
           ${idClause}
           AND id NOT IN (
             SELECT contact_id FROM scheduled_message
              WHERE automation_id = ? AND status = 'scheduled' AND contact_id IS NOT NULL
           )
         ORDER BY id
         LIMIT ${MAX_AUTOMATION_LEADS}`,
      orgId, ...audParams, ...idParams, automationId,
    );

  const candidates: { id: number }[] = [];
  if (explicitIds.length) {
    for (let i = 0; i < explicitIds.length; i += 90) {
      const slice = explicitIds.slice(i, i + 90);
      const idClause = `AND id IN (${slice.map(() => "?").join(",")})`;
      candidates.push(...(await runCandidates(idClause, slice)));
    }
  } else {
    candidates.push(...(await runCandidates("", [])));
  }

  // Enroll the whole candidate set in batched D1 transactions (one round-trip
  // per ~50 messages) instead of a per-lead query storm. All compliance guards
  // (suppression, one-automation-per-lead, footers, personalization) run inside.
  const candidateIds = candidates.map((c) => c.id);
  const { enrolled } = await bulkEnrollAutomation(env, automationId, candidateIds, user.id);

  // Reflect the outbound enrollment on the lead's AI status WITHOUT clobbering a
  // lead that already has inbound AI active ('active') or was deliberately
  // paused/off - only NULL/'off'/'outbound' leads move to 'outbound'.
  // Chunk at 90 - D1 caps bound params per statement at ~100, so the prior
  // slice of 400 threw "too many SQL variables" and left enrollment half-done.
  const tsNow = nowIso();
  for (let i = 0; i < candidateIds.length; i += 90) {
    const slice = candidateIds.slice(i, i + 90);
    await execute(
      env.D1DB,
      `UPDATE lead SET ai_status = 'outbound', updated_at = ?
        WHERE id IN (${slice.map(() => "?").join(",")})
          AND (ai_status IS NULL OR ai_status IN ('off', 'outbound'))`,
      tsNow, ...slice,
    );
  }

  return json({ success: true, enrolled, audience: explicitIds.length ? "custom" : audience });
};
