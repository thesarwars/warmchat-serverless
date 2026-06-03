/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../../../_shared/db.ts";
import { requireApiKey } from "../../../../../_shared/apiAuth.ts";
import { queueAutomationForLead } from "../../../../../_shared/automationEnroll.ts";
import { cancelPendingFollowups } from "../../../../../_shared/autoResponse.ts";
import { resolveActorUserId } from "../../../../../_shared/integrationApi.ts";

/**
 * POST /api/integrations/v1/leads/:id/enroll - Enroll Lead in the AI workflow.
 * Mirrors the import apply-ai semantics for a single lead:
 *   inbound_enabled -> ai_status 'active'; automation_id only -> 'outbound';
 *   enabled:false    -> 'paused' (cancels any pending drip).
 * Enrollment only queues messages; sends stay guarded at send time.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const auth = await requireApiKey(env, request, "leads:write");
  if (!auth) return error("Invalid or missing API key", 401);

  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid lead id", 400);

  const lead = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM lead WHERE id = ? AND org_id = ?`,
    id,
    auth.orgId,
  );
  if (!lead) return error("Lead not found", 404);

  const body = (await readJson<{ automation_id?: number; inbound_enabled?: boolean; enabled?: boolean }>(request)) || {};

  if (body.enabled === false) {
    await cancelPendingFollowups(env, id);
    await execute(env.D1DB, `UPDATE lead SET ai_status = 'paused', updated_at = ? WHERE id = ?`, nowIso(), id);
    return json({ ok: true, ai_status: "paused" });
  }

  const automationId = Number(body.automation_id) || 0;
  const inboundEnabled = body.inbound_enabled === true;
  if (automationId) {
    const camp = await queryFirst<{ id: number }>(
      env.D1DB,
      `SELECT id FROM automation WHERE id = ? AND org_id = ?`,
      automationId,
      auth.orgId,
    );
    if (!camp) return error("Automation not found in this organization", 404);
  }

  const aiStatus = inboundEnabled ? "active" : automationId ? "outbound" : "off";
  await execute(env.D1DB, `UPDATE lead SET ai_status = ?, updated_at = ? WHERE id = ?`, aiStatus, nowIso(), id);
  if (automationId) {
    const actor = await resolveActorUserId(env, auth.orgId, auth.createdByUserId);
    await queueAutomationForLead(env, automationId, id, actor ?? 0);
  }

  return json({ ok: true, ai_status: aiStatus });
};
