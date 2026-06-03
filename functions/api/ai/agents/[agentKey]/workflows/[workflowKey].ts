/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../../_shared/http.ts";
import { queryFirst, execute } from "../../../../../_shared/db.ts";
import { requireUser } from "../../../../../_shared/auth.ts";
import { callerOrgId, isAgentKey, ensureWorkflows } from "../../../../../_shared/aiAgents.ts";
import { setBookingEnabled } from "../../../../../_shared/availability.ts";

/**
 * Inbound workflow cards mirror onto the auto_response_settings flags so
 * toggling a card actually flips the engine that runs the behavior. Outbound
 * cards (o1-o5) pause/resume the automations explicitly linked to them via
 * automation.workflow_key - a real engine effect, not just a persisted flag.
 * w5 (booking) is special: it drives agent_availability.enabled (the booking
 * master control) so the card and the Availability editor are the same toggle.
 */
const INBOUND_FIELD: Record<string, string> = {
  w1: "inbound_sms_enabled",
  w2: "qualification_enabled",
  w3: "missed_call_enabled",
  w4: "inbound_new_send_reply",
};
const OUTBOUND_KEYS = ["o1", "o2", "o3", "o4", "o5"];

/** PATCH /api/ai/agents/:agentKey/workflows/:workflowKey -> toggle enabled. */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const agentKey = String(params.agentKey);
  const workflowKey = String(params.workflowKey);
  if (!isAgentKey(agentKey)) return error("Unknown agent", 404);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const body = (await readJson<{ enabled?: boolean }>(request)) || {};
  if (typeof body.enabled !== "boolean") return error("enabled (boolean) is required", 400);
  const enabled = body.enabled ? 1 : 0;

  // Materialize the canonical cards if a toggle arrives before the first GET.
  await ensureWorkflows(env, orgId, user.id, agentKey);

  const existing = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM ai_workflow WHERE org_id = ? AND user_id = ? AND agent_key = ? AND workflow_key = ? LIMIT 1`,
    orgId, user.id, agentKey, workflowKey,
  );
  if (!existing) return error("Unknown workflow", 404);

  await execute(
    env.D1DB,
    `UPDATE ai_workflow SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    enabled, existing.id,
  );

  // Mirror inbound toggles onto the engine that actually runs them. The booking
  // card (w5) is the same toggle as the Availability editor's master switch, so
  // it drives agent_availability.enabled instead of a settings column.
  if (agentKey === "inbound" && workflowKey === "w5") {
    await setBookingEnabled(env, orgId, user.id, body.enabled);
  } else {
    const field = agentKey === "inbound" ? INBOUND_FIELD[workflowKey] : undefined;
    if (field) {
      await execute(
        env.D1DB,
        `UPDATE auto_response_settings SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND org_id = ?`,
        enabled, user.id, orgId,
      );
    }
  }

  // Outbound cards govern the automations linked to them: turning the card off
  // pauses every Running automation tagged with this key (the cron then holds
  // their queued drips); turning it back on resumes the paused ones. org_id is
  // stored as TEXT on automation, so bind the string form.
  let governed = 0;
  if (agentKey === "outbound" && OUTBOUND_KEYS.includes(workflowKey)) {
    const target = body.enabled ? "Paused" : "Running";
    const next = body.enabled ? "Running" : "Paused";
    const res = await execute(
      env.D1DB,
      `UPDATE automation SET status = ?
         WHERE org_id = ? AND owner_id = ? AND workflow_key = ?
           AND is_archived = 0 AND completed = 0 AND status = ?`,
      next, String(orgId), String(user.id), workflowKey, target,
    );
    governed = Number(res.meta.changes ?? 0);
  }

  return json({ key: workflowKey, enabled: Boolean(enabled), governed });
};
