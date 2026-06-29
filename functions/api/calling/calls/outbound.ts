/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute, queryFirst, queryAll, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { resolveOrgId } from "../../../_shared/callingAccess.ts";
import { dial, hangup } from "../../../_shared/telnyx/client.ts";
import { notifyQuotaExceeded } from "../../../_shared/quotaNotify.ts";
import { planMinuteLimit } from "../../../_shared/plans.ts";
import { tryNormalizeE164 } from "../../../_shared/phone.ts";
import { normalizedPhoneSql } from "../../../_shared/smsCompliance.ts";

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

  // Self-heal: starting a new outbound call means any earlier non-terminal call
  // for this agent is already over (the UI only lets one call run at a time).
  // Finalize those rows NOW so a missed `call.hangup` webhook can't leave a stale
  // 'IN_PROGRESS' that the busy-on-busy guard would use to auto-drop this new
  // call (the "2nd call hangs up" bug). Cheap: usually matches 0 rows.
  const priorOpen = await queryAll<{
    id: string; provider_call_sid: string | null; web_leg_sid: string | null; phone_leg_sid: string | null;
  }>(
    env.D1DB,
    `SELECT id, provider_call_sid, web_leg_sid, phone_leg_sid FROM calls
      WHERE agent_id = ? AND status IN ('INITIATED', 'RINGING', 'IN_PROGRESS')`,
    user.id,
  );
  if (priorOpen.length) {
    const healTs = nowIso();
    // Never-connected (INITIATED/RINGING) -> NO_ANSWER, connected (IN_PROGRESS) ->
    // COMPLETED, so a phantom that never answered isn't logged as a 0-second
    // completed call (which would skew avg-duration). The leg hangup below lets a
    // real call.hangup webhook overwrite duration on the COMPLETED ones.
    await execute(
      env.D1DB,
      `UPDATE calls SET status = 'NO_ANSWER', completed_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE agent_id = ? AND status IN ('INITIATED', 'RINGING')`,
      healTs, user.id,
    );
    await execute(
      env.D1DB,
      `UPDATE calls SET status = 'COMPLETED', completed_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE agent_id = ? AND status = 'IN_PROGRESS'`,
      healTs, user.id,
    );
    // Clear any lingering "active call" card in other tabs/devices.
    for (const c of priorOpen) {
      await emitCallState(env, user.id, { callId: c.id, status: "COMPLETED", terminal: true });
    }
    // Best-effort hang up any still-live Telnyx leg: (1) kills a zombie leg that
    // would otherwise keep billing airtime, and (2) makes its real call.hangup
    // webhook land so handleHangup writes the usage_record for any connected
    // minutes (the raw UPDATE above bills nothing on its own). Fire-and-forget via
    // waitUntil so it never adds latency to the new dial; a leg that already ended
    // just 404s harmlessly. Placeholder sids ("pending-web-*"/"") are skipped.
    const legs = priorOpen
      .flatMap((c) => [c.provider_call_sid, c.web_leg_sid, c.phone_leg_sid])
      .filter((s): s is string => !!s && !s.startsWith("pending"));
    if (legs.length) {
      context.waitUntil(Promise.all(legs.map((sid) => hangup(env, sid).catch(() => undefined))));
    }
  }

  const body = (await readJson<{
    phoneNumber?: string; leadId?: string; name?: string; origin?: "phone" | "web";
  }>(request)) || {};
  const origin = body.origin === "web" ? "web" : "phone";
  // Latency instrumentation: how long the server spends before contacting the
  // provider, and the provider call itself. Surfaces whether a slow ring is our
  // preamble (D1) or Telnyx-side. Visible in `wrangler pages deployment tail`.
  const t0 = Date.now();

  const leadIdNum = body.leadId != null && body.leadId !== "" ? Number(body.leadId) : null;
  if (leadIdNum != null && !Number.isInteger(leadIdNum)) return error("leadId must be numeric", 400);

  // PERF: fire the independent reads concurrently. Each only depends on
  // user.id / orgId, so running them in parallel collapses ~5 sequential D1
  // round-trips - the bulk of the click-to-dial latency, made worse by the
  // cross-region D1 - into a single one, so we reach the Telnyx dial (and the
  // phone starts ringing) as fast as possible.
  const [agentNumber, agent, cfg, cycle, leadById] = await Promise.all([
    // Agent's assigned business number.
    queryFirst<{ id: string; phone_number: string }>(
      env.D1DB,
      `SELECT id, phone_number FROM phone_numbers
        WHERE assigned_to_user_id = ? AND status = 'ACTIVE' LIMIT 1`,
      user.id,
    ),
    // Agent identity (real cell + SIP).
    queryFirst<{
      id: number; name: string | null; email: string;
      agent_phone_number: string | null; telnyx_sip_uri: string | null;
    }>(
      env.D1DB,
      `SELECT id, name, email, agent_phone_number, telnyx_sip_uri FROM "user" WHERE id = ?`,
      user.id,
    ),
    // Calling config (enabled + overage policy).
    queryFirst<{ calling_enabled: number; auto_charge_overage: number }>(
      env.D1DB,
      `SELECT calling_enabled, auto_charge_overage FROM calling_configurations WHERE org_id = ?`,
      orgId,
    ),
    // Active billing cycle (used by the over-limit guard).
    ensureBillingCycle(env, orgId),
    // Lead by id (the common path). The phoneNumber path is resolved below.
    leadIdNum != null
      ? queryFirst<{ id: number; phone: string | null; org_id: number }>(
          env.D1DB, `SELECT id, phone, org_id FROM lead WHERE id = ?`, leadIdNum,
        )
      : Promise.resolve(null),
  ]);

  if (!agentNumber) return error("You don't have a business number assigned. Contact your admin.", 403);
  if (!agent) return error("User not found", 404);
  if (origin === "phone" && !agent.agent_phone_number) {
    return error("Configure your personal cell number first (required for phone-origin calls).", 400);
  }
  if (cfg && cfg.calling_enabled !== 1) return error("Calling is disabled for your workspace", 403);

  // Resolve / upsert lead.
  let leadId: number | null;
  let leadPhone: string | null;
  if (leadIdNum != null) {
    if (!leadById || leadById.org_id !== orgId) return error("Lead not found", 404);
    leadId = leadById.id;
    leadPhone = leadById.phone;
  } else if (body.phoneNumber) {
    // Normalize to E.164 + dedup on the last 10 digits (mirrors leadIntake's
    // findExisting). The old exact-string match on the raw client-supplied number
    // missed format variants (+15594705204 vs 5594705204 vs (559) 470-5204), so a
    // re-formatted dial created a DUPLICATE lead - which, left at consent
    // 'unknown', re-added the STOP footer for a number that had already opted in
    // on another row. Match-normalized dedup is the root-cause fix for that split.
    const dialPhone = tryNormalizeE164(body.phoneNumber) ?? body.phoneNumber;
    const digits = dialPhone.replace(/\D/g, "");
    const suffix = digits.length >= 10 ? digits.slice(-10) : digits;
    const existing = suffix
      ? await queryFirst<{ id: number; phone: string | null }>(
          env.D1DB,
          `SELECT id, phone FROM lead
             WHERE org_id = ? AND phone IS NOT NULL
               AND ${normalizedPhoneSql("phone")} LIKE ?
             LIMIT 1`,
          orgId, `%${suffix}`,
        )
      : null;
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
        `INSERT INTO lead (name, phone, source, status, owner_id, org_id, created_at, updated_at)
         VALUES (?, ?, 'Outbound Call', 'New', ?, ?, ?, ?)`,
        body.name ?? null, dialPhone, user.id, orgId, nowIso(), nowIso(),
      );
      leadId = Number(ins.meta.last_row_id);
      leadPhone = dialPhone;
    }
  } else {
    return error("Either leadId or phoneNumber is required", 400);
  }

  if (!leadPhone) return error("Lead has no phone number to dial", 400);

  // Over-limit guard (needs the billing cycle id resolved in the batch above).
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
    console.log(`[outbound] web callId=${callId} preamble=${Date.now() - t0}ms`);
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
  const tDial = Date.now();
  const dialed = await dial(env, {
    from: agentNumber.phone_number,
    to: agent.agent_phone_number!,
    connectionId: env.TELNYX_CONNECTION_ID,
    timeoutSecs: 30,
    webhookUrl: `${origin_url}/api/webhooks/calling/telnyx/status`,
    customHeaders: [{ name: "X-WC-Call-Id", value: callId }],
  });
  console.log(
    `[outbound] phone callId=${callId} preamble=${tDial - t0}ms dial=${Date.now() - tDial}ms ok=${dialed.ok}`,
  );
  if (!dialed.ok) {
    await execute(
      env.D1DB,
      `UPDATE calls SET status = 'FAILED', error_message = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      dialed.error.message, now, callId,
    );
    // Push the terminal state so the Calls page drops the live row / updates the
    // counters instead of leaving a stale "ringing" entry until a manual reload.
    await emitCallState(env, user.id, {
      callId, status: "FAILED", direction: "OUTBOUND", origin: "phone", terminal: true,
    });
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
