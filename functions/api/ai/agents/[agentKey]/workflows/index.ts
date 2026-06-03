/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../_shared/env.ts";
import { json, error } from "../../../../../_shared/http.ts";
import { queryAll, queryFirst } from "../../../../../_shared/db.ts";
import { requireUser } from "../../../../../_shared/auth.ts";
import { callerOrgId, isAgentKey, ensureWorkflows } from "../../../../../_shared/aiAgents.ts";
import { getBookingEnabled } from "../../../../../_shared/availability.ts";

// Inbound cards reflect the REAL engine flags (auto_response_settings), not the
// ai_workflow defaults - so the toggles show the actual configured behavior.
// w5 (booking) is sourced from agent_availability.enabled instead (see below).
const INBOUND_FIELD: Record<string, string> = {
  w1: "inbound_sms_enabled",
  w2: "qualification_enabled",
  w3: "missed_call_enabled",
  w4: "inbound_new_send_reply",
};

interface WorkflowRow {
  workflow_key: string; name: string;
  trigger_type: string | null; trigger_source: string | null;
  action: string | null; outcome: string | null;
  enabled: number; position: number; runs_24h: number;
}

const ser = (r: WorkflowRow, governed: number) => ({
  key: r.workflow_key,
  name: r.name,
  trigger: { type: r.trigger_type, source: r.trigger_source },
  action: r.action,
  outcome: r.outcome,
  enabled: Boolean(r.enabled),
  position: r.position,
  runs_24h: r.runs_24h,
  // Outbound cards: how many automations this card actually governs (0 = the
  // toggle has nothing to pause/resume yet).
  governed,
});

/** GET /api/ai/agents/:agentKey/workflows -> ordered workflow cards. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const agentKey = String(params.agentKey);
  if (!isAgentKey(agentKey)) return error("Unknown agent", 404);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  // Lazily create the canonical card set on first read (matches the
  // "starts empty, lazy-default" convention). No-op once they exist.
  await ensureWorkflows(env, orgId, user.id, agentKey);

  const rows = await queryAll<WorkflowRow>(
    env.D1DB,
    `SELECT workflow_key, name, trigger_type, trigger_source, action, outcome, enabled, position, runs_24h
       FROM ai_workflow WHERE org_id = ? AND user_id = ? AND agent_key = ? ORDER BY position`,
    orgId, user.id, agentKey,
  );

  // For outbound cards, count the automations each card governs (org_id is TEXT
  // on automation). Inbound cards have no automation link -> governed stays 0.
  const counts = new Map<string, number>();
  if (agentKey === "outbound") {
    const linked = await queryAll<{ workflow_key: string; c: number }>(
      env.D1DB,
      `SELECT workflow_key, COUNT(1) AS c FROM automation
         WHERE org_id = ? AND owner_id = ? AND workflow_key IS NOT NULL AND is_archived = 0
         GROUP BY workflow_key`,
      String(orgId), String(user.id),
    );
    for (const l of linked) counts.set(l.workflow_key, Number(l.c));
  }

  // Inbound: overlay the live engine flags onto each card's enabled so the
  // toggles reflect the real auto_response_settings, not the ai_workflow seed.
  if (agentKey === "inbound") {
    const settings = await queryFirst<Record<string, number | null>>(
      env.D1DB,
      `SELECT inbound_sms_enabled, qualification_enabled, missed_call_enabled,
              inbound_new_send_reply, booking_handoff_enabled
         FROM auto_response_settings WHERE org_id = ? AND user_id = ? LIMIT 1`,
      orgId, user.id,
    );
    if (settings) {
      for (const r of rows) {
        const field = INBOUND_FIELD[r.workflow_key];
        if (field && field in settings) r.enabled = settings[field] ? 1 : 0;
      }
    }
    // w5 (booking) is the same toggle as the Availability editor's master
    // switch - it reflects agent_availability.enabled, not a settings column.
    const bookingOn = await getBookingEnabled(env, orgId, user.id);
    for (const r of rows) if (r.workflow_key === "w5") r.enabled = bookingOn ? 1 : 0;
  }

  return json({ workflows: rows.map((r) => ser(r, counts.get(r.workflow_key) ?? 0)) });
};
