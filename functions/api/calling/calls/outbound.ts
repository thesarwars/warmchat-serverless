/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { resolveOrgId } from "../../../_shared/callingAccess.ts";
import { dial } from "../../../_shared/telnyx/client.ts";
import { notifyQuotaExceeded } from "../../../_shared/quotaNotify.ts";
import { planMinuteLimit } from "../../../_shared/plans.ts";

/**
 * POST /api/calling/calls/outbound - kick off an outbound call.
 *
 * Body: { phoneNumber?, leadId?, name?, origin: "phone" | "web" }
 *
 *   origin === "phone" - agent-first PSTN: we issue Telnyx /v2/calls to dial
 *     the agent's cell now. When the agent answers, the status webhook bridges
 *     in the customer (handled by CallActorDO.onAnswered in Phase 7).
 *
 *   origin === "web"   - browser places the call via @telnyx/webrtc. We don't
 *     touch Telnyx here; we just create a placeholder call row with
 *     `provider_call_sid = "pending-web-<callId>"` so the UI has an id to bind
 *     state to. CallActorDO.onWebOutbound attaches the real call_control_id
 *     when Telnyx fires call.initiated for the browser leg.
 *
 * Response: { callId, status }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await resolveOrgId(env, user.id);
  if (!orgId) return error("Not part of an organization", 403);

  const body = (await readJson<{
    phoneNumber?: string; leadId?: string; name?: string; origin?: "phone" | "web";
  }>(request)) || {};
  const origin = body.origin === "web" ? "web" : "phone";

  // Agent must have a business number assigned.
  const agentNumber = await queryFirst<{ id: string; phone_number: string }>(
    env.D1DB,
    `SELECT id, phone_number FROM phone_numbers
      WHERE assigned_to_user_id = ? AND status = 'ACTIVE' LIMIT 1`,
    user.id,
  );
  if (!agentNumber) return error("You don't have a business number assigned. Contact your admin.", 403);

  // Agent identity (real cell + SIP) - needed depending on origin.
  const agent = await queryFirst<{
    id: number; name: string | null; email: string;
    agent_phone_number: string | null; telnyx_sip_uri: string | null;
  }>(
    env.D1DB,
    `SELECT id, name, email, agent_phone_number, telnyx_sip_uri FROM "user" WHERE id = ?`,
    user.id,
  );
  if (!agent) return error("User not found", 404);
  if (origin === "phone" && !agent.agent_phone_number) {
    return error("Configure your personal cell number first (required for phone-origin calls).", 400);
  }

  // Resolve / upsert lead.
  let leadId: number | null;
  let leadPhone: string | null;
  if (body.leadId) {
    const id = Number(body.leadId);
    if (!Number.isInteger(id)) return error("leadId must be numeric", 400);
    const lead = await queryFirst<{ id: number; phone: string | null; org_id: number }>(
      env.D1DB, `SELECT id, phone, org_id FROM lead WHERE id = ?`, id,
    );
    if (!lead || lead.org_id !== orgId) return error("Lead not found", 404);
    leadId = lead.id;
    leadPhone = lead.phone;
  } else if (body.phoneNumber) {
    const existing = await queryFirst<{ id: number; phone: string | null }>(
      env.D1DB,
      `SELECT id, phone FROM lead WHERE org_id = ? AND phone = ? LIMIT 1`,
      orgId, body.phoneNumber,
    );
    if (existing) {
      leadId = existing.id;
      leadPhone = existing.phone;
      if (body.name) {
        await execute(
          env.D1DB,
          `UPDATE lead SET name = COALESCE(NULLIF(name, ''), ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          body.name, existing.id,
        );
      }
    } else {
      const ins = await execute(
        env.D1DB,
        `INSERT INTO lead (name, phone, status, owner_id, org_id, created_at, updated_at)
         VALUES (?, ?, 'New', ?, ?, ?, ?)`,
        body.name ?? null, body.phoneNumber, user.id, orgId, nowIso(), nowIso(),
      );
      leadId = Number(ins.meta.last_row_id);
      leadPhone = body.phoneNumber;
    }
  } else {
    return error("Either leadId or phoneNumber is required", 400);
  }

  if (!leadPhone) return error("Lead has no phone number to dial", 400);

  // Calling config + over-limit guard.
  const cfg = await queryFirst<{ calling_enabled: number; auto_charge_overage: number }>(
    env.D1DB,
    `SELECT calling_enabled, auto_charge_overage FROM calling_configurations WHERE org_id = ?`,
    orgId,
  );
  if (cfg && cfg.calling_enabled !== 1) return error("Calling is disabled for your workspace", 403);

  const cycle = await ensureBillingCycle(env, orgId);
  if (cfg && cfg.auto_charge_overage !== 1) {
    const used = await queryFirst<{ total: number }>(
      env.D1DB,
      `SELECT COALESCE(SUM(minutes), 0) AS total FROM usage_records
        WHERE org_id = ? AND billing_cycle_id = ?`,
      orgId, cycle.id,
    );
    if ((used?.total ?? 0) >= cycle.plan_minute_limit) {
      await notifyQuotaExceeded(env, orgId, "voice");
      return error("Monthly calling limit exceeded. Enable auto-charge overage or upgrade.", 403);
    }
  }

  const callId = crypto.randomUUID();
  const now = nowIso();

  if (origin === "web") {
    // Placeholder; the browser-initiated call.initiated webhook will attach the real id.
    await execute(
      env.D1DB,
      `INSERT INTO calls
         (id, provider_call_sid, direction, status, from_number, to_number,
          lead_id, agent_id, business_number_id, agent_phone_number, customer_number,
          origin, org_id, initiated_at, created_at, updated_at, provider_metadata)
       VALUES (?, ?, 'OUTBOUND', 'INITIATED', ?, ?, ?, ?, ?, ?, ?, 'web', ?, ?, ?, ?, ?)`,
      callId, `pending-web-${callId}`,
      agentNumber.phone_number, leadPhone,
      leadId, user.id, agentNumber.id,
      agent.telnyx_sip_uri ?? agent.agent_phone_number ?? "",
      leadPhone, orgId, now, now, now,
      JSON.stringify({ stage: "WEB_PENDING" }),
    );

    await emitCallState(env, user.id, {
      callId, status: "INITIATED", direction: "OUTBOUND", origin: "web", destination: leadPhone,
    });
    // Return the agent's assigned DID so the browser SDK can stamp it as the
    // caller-id on the WebRTC INVITE (otherwise Telnyx falls back to the SIP
    // Connection's default and every tenant shows the same number).
    return json({ callId, status: "INITIATED", fromNumber: agentNumber.phone_number });
  }

  // origin === "phone": dial the agent's cell now.
  if (!env.TELNYX_CONNECTION_ID) return error("Voice connection not configured (TELNYX_CONNECTION_ID)", 503);

  // Create call row in INITIATED first so we have something to update with the sid.
  await execute(
    env.D1DB,
    `INSERT INTO calls
       (id, provider_call_sid, direction, status, from_number, to_number,
        lead_id, agent_id, business_number_id, agent_phone_number, customer_number,
        origin, org_id, initiated_at, created_at, updated_at)
     VALUES (?, '', 'OUTBOUND', 'INITIATED', ?, ?, ?, ?, ?, ?, ?, 'phone', ?, ?, ?, ?)`,
    callId, agentNumber.phone_number, leadPhone, leadId, user.id, agentNumber.id,
    agent.agent_phone_number, leadPhone, orgId, now, now, now,
  );

  const origin_url = new URL(request.url).origin;
  const dialed = await dial(env, {
    from: agentNumber.phone_number,
    to: agent.agent_phone_number!,
    connectionId: env.TELNYX_CONNECTION_ID,
    timeoutSecs: 30,
    webhookUrl: `${origin_url}/api/webhooks/calling/telnyx/status`,
    customHeaders: [{ name: "X-WC-Call-Id", value: callId }],
  });
  if (!dialed.ok) {
    await execute(
      env.D1DB,
      `UPDATE calls SET status = 'FAILED', error_message = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      dialed.error.message, now, callId,
    );
    return error(`Failed to initiate call: ${dialed.error.message}`, 502);
  }

  await execute(
    env.D1DB,
    `UPDATE calls
        SET provider_call_sid = ?, status = 'RINGING', ringing_at = ?,
            provider_metadata = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    dialed.data.call_control_id, now,
    JSON.stringify({
      stage: "DIALING_AGENT",
      customerNumber: leadPhone,
      agentPhoneNumber: agent.agent_phone_number,
      businessNumber: agentNumber.phone_number,
    }),
    callId,
  );

  await execute(
    env.D1DB,
    `INSERT INTO call_events (id, call_id, event_type, timestamp, payload, provider_event_id)
     VALUES (?, ?, 'CALL_INITIATED', ?, ?, ?)`,
    crypto.randomUUID(), callId, now,
    JSON.stringify({ direction: "OUTBOUND", stage: "DIALING_AGENT" }),
    dialed.data.call_control_id,
  );

  await emitCallState(env, user.id, {
    callId, status: "RINGING", direction: "OUTBOUND", origin: "phone",
  });

  return json({ callId, status: "RINGING" });
};

// ---------- helpers ----------

async function ensureBillingCycle(env: Env, orgId: number): Promise<{ id: string; plan_minute_limit: number }> {
  const existing = await queryFirst<{ id: string; plan_minute_limit: number }>(
    env.D1DB,
    `SELECT id, plan_minute_limit FROM billing_cycles
      WHERE org_id = ? AND status = 'ACTIVE'
      ORDER BY start_date DESC LIMIT 1`,
    orgId,
  );
  if (existing) return existing;

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
  const id = crypto.randomUUID();
  const orgPlanRow = await queryFirst<{ plan: string | null }>(
    env.D1DB,
    `SELECT plan FROM organization WHERE id = ?`,
    orgId,
  );
  const minuteLimit = planMinuteLimit(orgPlanRow?.plan);
  await execute(
    env.D1DB,
    `INSERT INTO billing_cycles (id, org_id, start_date, end_date, status, plan_minute_limit, overage_rate)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, 0.02)`,
    id, orgId, start.toISOString(), end.toISOString(), minuteLimit,
  );
  return { id, plan_minute_limit: minuteLimit };
}

/**
 * Fire-and-forget push of a call_state event into the user's gateway DO.
 * Failure to deliver doesn't fail the API call - the event will be re-sent
 * later if the DO comes back online.
 */
async function emitCallState(
  env: Env,
  userId: number,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!env.GATEWAY) return;
  try {
    await env.GATEWAY.fetch(`http://gw/do/userSocket/user:${userId}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "call_state", data: payload }),
    });
  } catch {
    // Gateway not deployed yet (Phase 7) or transient - non-fatal.
  }
}
