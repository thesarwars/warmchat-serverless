/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { execute, queryFirst, nowIso } from "../../../../_shared/db.ts";
import { verifyTelnyxSignature } from "../../../../_shared/telnyx/verify.ts";
import { bridge, dialForkLeg, executeCallControl, hangup, startRecording } from "../../../../_shared/telnyx/client.ts";
import { mockTelnyxSendSms } from "../../../../_shared/mockSendApi.ts";
import { notify } from "../../../../_shared/notify.ts";
import { notifyQuotaExceeded } from "../../../../_shared/quotaNotify.ts";
import { planMinuteLimit } from "../../../../_shared/plans.ts";
import { isPhoneSuppressed } from "../../../../_shared/suppression.ts";
import { appendComplianceFooter } from "../../../../_shared/smsCompliance.ts";
import { createTask } from "../../../../_shared/tasks.ts";

/**
 * POST /api/webhooks/calling/telnyx/status - Telnyx Call Control events.
 *
 * Flow per delivery:
 *   1. Verify Ed25519 signature.
 *   2. INSERT OR IGNORE into webhook_logs by Telnyx event id (idempotency).
 *      If already seen, return 200 with no work.
 *   3. Dispatch on event_type:
 *        - call.initiated  direction=outgoing + SIP/pending-web -> attach
 *          call_control_id to the placeholder call row.
 *        - call.initiated  direction=incoming -> answer anchor, fork dial the
 *          agent's web/phone legs (was previously in inbound.ts, merged here
 *          because Telnyx Voice API Apps only allow ONE webhook URL).
 *        - call.answered + fork-leg client_state -> atomic winner claim via
 *          CallActorDO, then bridge winner to anchor + hangup loser.
 *        - call.answered + outgoing (agent-first PSTN) -> transfer the customer
 *          into the agent leg.
 *        - call.hangup -> write terminal status + usage_record + missed-call SMS
 *          (inbound only) + emit `call_state` terminal to the agent's WS.
 *   4. Always return 200 - non-2xx triggers Telnyx auto-retry, which would
 *      duplicate our own queue. Failures are logged in webhook_logs.status =
 *      'FAILED' for the cron sweep to retry.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const rawBody = await request.text();

  if (!(await verifyTelnyxSignature(env, rawBody, request.headers))) {
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 403 });
  }

  let event: TelnyxEvent;
  try { event = JSON.parse(rawBody) as TelnyxEvent; }
  catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400 }); }

  const eventId = event.data?.id ?? event.id;
  const eventType = event.data?.event_type ?? event.event_type ?? "";
  const payload = event.data?.payload ?? event.payload ?? {};
  if (!eventId || !eventType) {
    return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200 });
  }

  // Idempotency: INSERT OR IGNORE on the unique provider_event_id.
  const ins = await execute(
    env.D1DB,
    `INSERT OR IGNORE INTO webhook_logs (id, provider_event_id, provider, event_type, status, payload, received_at, updated_at)
     VALUES (?, ?, 'telnyx', ?, 'PROCESSING', ?, ?, ?)`,
    crypto.randomUUID(), eventId, eventType, rawBody, nowIso(), nowIso(),
  );
  if (ins.meta.changes === 0) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
  }

  try {
    await handleEvent(env, eventType, payload, request.url);
    await execute(
      env.D1DB,
      `UPDATE webhook_logs SET status = 'PROCESSED', processed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE provider_event_id = ?`,
      nowIso(), eventId,
    );
  } catch (err) {
    await execute(
      env.D1DB,
      `UPDATE webhook_logs SET status = 'FAILED', error_message = ?, last_retry_at = ?,
                               next_retry_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE provider_event_id = ?`,
      (err as Error).message, nowIso(),
      new Date(Date.now() + 60_000).toISOString(),
      eventId,
    );
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
};

// ---------- dispatch ----------

async function handleEvent(env: Env, eventType: string, payload: TelnyxPayload, requestUrl: string): Promise<void> {
  const callControlId = payload.call_control_id;
  if (!callControlId) return;

  switch (eventType) {
    case "call.initiated":
      if (payload.direction === "outgoing") await handleOutgoingInitiated(env, payload, callControlId);
      else if (payload.direction === "incoming") await handleIncomingInitiated(env, payload, callControlId, requestUrl);
      return;
    case "call.answered":
      await handleAnswered(env, payload, callControlId);
      return;
    case "call.hangup":
      await handleHangup(env, payload, callControlId);
      return;
    case "call.recording.saved":
      await handleRecordingSaved(env, payload, callControlId);
      return;
  }
}

/** True when the org owning this call has recording enabled. */
async function recordingEnabledForCall(env: Env, callId: string): Promise<boolean> {
  const row = await queryFirst<{ recording_enabled: number }>(
    env.D1DB,
    `SELECT cc.recording_enabled FROM calls c
       JOIN calling_configurations cc ON cc.org_id = c.org_id
      WHERE c.id = ?`,
    callId,
  );
  return row?.recording_enabled === 1;
}

/**
 * Two-party-consent disclosure spoken on the anchor leg BEFORE recording
 * begins. 12 US states (CA, CT, FL, IL, MD, MA, MT, NV, NH, PA, WA, OR)
 * require all parties to consent to a recording, so we play the same
 * disclosure on every recorded call regardless of the org's state - mirrors
 * what large enterprises do (e.g. "this call may be recorded for quality
 * and training purposes"). The disclosure is short enough not to be jarring
 * but explicit enough to satisfy the consent requirement.
 */
const RECORDING_DISCLOSURE =
  "Please note: this call may be recorded for quality and training purposes.";

/**
 * Speak the two-party-consent disclosure on the anchor leg, then start the
 * recording. Best-effort - a speak failure should not block the recording
 * (we'd rather have the recording without the perfect disclosure than no
 * recording at all if the speak step glitches). The speak call is awaited
 * so the disclosure plays BEFORE the recording begins.
 */
async function announceAndStartRecording(
  env: Env,
  anchorCallControlId: string,
): Promise<void> {
  try {
    await executeCallControl(env, anchorCallControlId, {
      command: "speak",
      payload: RECORDING_DISCLOSURE,
      voice: "female",
      language: "en-US",
    });
  } catch (err) {
    console.warn("[recording] disclosure speak failed", err);
  }
  await startRecording(env, anchorCallControlId);
}

/** Fire-and-forget: start recording the anchor leg if the org opted in. */
async function maybeStartRecording(env: Env, callId: string, anchorCallControlId: string): Promise<void> {
  try {
    if (await recordingEnabledForCall(env, callId)) {
      await announceAndStartRecording(env, anchorCallControlId);
    }
  } catch (err) {
    console.warn("[recording] startRecording failed", err);
  }
}

/**
 * A fork leg hung up. Ask the CallActorDO whether all dialed legs are now
 * exhausted with no winner; if so (and the org enabled voicemail), divert the
 * still-live anchor to a voicemail greeting + recording. Ships dark behind
 * calling_configurations.voicemail_enabled.
 */
async function maybeDivertToVoicemail(env: Env, forkLegSid: string): Promise<void> {
  const call = await queryFirst<{
    id: string; org_id: number; answered_at: string | null;
    agent_id: number | null; lead_id: number | null; customer_number: string | null;
    business_number_id: number | null; provider_call_sid: string;
  }>(
    env.D1DB,
    `SELECT id, org_id, answered_at, agent_id, lead_id, customer_number, business_number_id, provider_call_sid
       FROM calls WHERE web_leg_sid = ? OR phone_leg_sid = ? LIMIT 1`,
    forkLegSid, forkLegSid,
  );
  if (!call || call.answered_at) return;

  // Track the dead leg FIRST (independent of voicemail config) so the
  // exhausted check below works for every org.
  const res = await gatewayFetch<{ exhausted?: boolean; anchorSid?: string }>(
    env, `/do/callActor/call:${call.id}/leg-down`, "POST", { sid: forkLegSid },
  );
  if (!res?.exhausted || !res.anchorSid) return;

  // Every fork leg is down with no winner: the ring is over. Tell every open
  // tab/device to stop ringing - without this, a tab whose WebRTC leg never
  // paired keeps its modal + ringtone up forever after the timeout.
  if (call.agent_id) {
    await gatewayFetch(env, `/do/userSocket/user:${call.agent_id}/emit`, "POST", {
      event: "call_ring_ended",
      data: { callId: call.id, reason: "no_answer" },
    });
  }

  // This IS a missed call whether or not voicemail picks up - text the caller
  // back and leave the agent a notification + call-back task. Both helpers are
  // idempotent per call, so the later anchor-hangup path can't double-fire.
  const now = nowIso();
  const bn = call.business_number_id
    ? await queryFirst<{ phone_number: string }>(
        env.D1DB, `SELECT phone_number FROM phone_numbers WHERE id = ?`, call.business_number_id)
    : null;
  await sendMissedCallTextback(env, {
    orgId: call.org_id, agentId: call.agent_id,
    businessPhone: bn?.phone_number ?? null, customerNumber: call.customer_number ?? null,
    callId: call.id, callControlId: call.provider_call_sid,
  }, now);
  await recordMissedCall(env, {
    orgId: call.org_id, agentId: call.agent_id, leadId: call.lead_id ?? null,
    customerNumber: call.customer_number ?? null,
    callId: call.id, callControlId: call.provider_call_sid,
  }, now);

  const cfg = await queryFirst<{ voicemail_enabled: number; voicemail_greeting: string }>(
    env.D1DB,
    `SELECT voicemail_enabled, voicemail_greeting FROM calling_configurations WHERE org_id = ?`,
    call.org_id,
  );
  if (!cfg || cfg.voicemail_enabled !== 1) {
    // No voicemail: end the anchor too, otherwise the caller keeps hearing
    // ringback into the void until they give up.
    await hangup(env, res.anchorSid);
    return;
  }

  try {
    // The anchor is left ringing until pickup/voicemail - answer it now.
    await executeCallControl(env, res.anchorSid, { command: "answer" });
    await executeCallControl(env, res.anchorSid, {
      command: "speak",
      payload: cfg.voicemail_greeting,
      voice: "female",
      language: "en-US",
    });
    await startRecording(env, res.anchorSid);
    await execute(
      env.D1DB,
      `UPDATE calls SET provider_metadata = json_set(COALESCE(provider_metadata, '{}'), '$.awaitingVoicemail', json('true')), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      call.id,
    );
  } catch (err) {
    console.warn("[voicemail] divert failed", err);
  }
}

/**
 * Telnyx finished writing a recording (async, after hangup). Persist the sid +
 * the time-limited source URL into a PENDING call_ai_insights row; the
 * gateway-worker cron downloads -> R2, transcribes, and summarizes. No heavy
 * work here - the webhook must stay fast.
 */
async function handleRecordingSaved(env: Env, payload: TelnyxPayload, callControlId: string): Promise<void> {
  const call = await queryFirst<{ id: string; answered_at: string | null; provider_metadata: string | null }>(
    env.D1DB,
    `SELECT id, answered_at, provider_metadata FROM calls WHERE provider_call_sid = ? OR web_leg_sid = ? OR phone_leg_sid = ? LIMIT 1`,
    callControlId, callControlId, callControlId,
  );
  if (!call) return;

  const sourceUrl =
    payload.recording_urls?.mp3 || payload.recording_urls?.wav ||
    payload.public_recording_urls?.mp3 || payload.public_recording_urls?.wav || null;
  if (!sourceUrl) return;

  // A recording on a call that never connected to an agent is a voicemail.
  let awaitingVoicemail = false;
  try {
    awaitingVoicemail = !!(JSON.parse(call.provider_metadata || "{}") as { awaitingVoicemail?: boolean }).awaitingVoicemail;
  } catch { /* ignore */ }
  const isVoicemail = awaitingVoicemail || !call.answered_at;

  await execute(
    env.D1DB,
    `UPDATE calls SET recording_sid = ?, is_voicemail = CASE WHEN ? = 1 THEN 1 ELSE is_voicemail END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    payload.recording_id ?? payload.recording_session_id ?? null, isVoicemail ? 1 : 0, call.id,
  );

  // Insert PENDING insights row (idempotent on the call_id PK).
  await execute(
    env.D1DB,
    `INSERT OR IGNORE INTO call_ai_insights (call_id, recording_source_url, status) VALUES (?, ?, 'PENDING')`,
    call.id, sourceUrl,
  );
}

/**
 * Text the caller back after an unanswered inbound call so a lead never hits a
 * dead end - covers the "nobody to ring" drop (agent's browser dialer not
 * registered + no phone leg) AND the regular call.hangup NO_ANSWER/BUSY/FAILED
 * path. Idempotent per call via the MISSED_CALL_SMS_SENT call_event, so the two
 * paths never double-send. Respects the agent's AI/missed-call toggles and
 * caller suppression.
 */
async function sendMissedCallTextback(
  env: Env,
  a: { orgId: number | null; agentId: number | null; businessPhone: string | null; customerNumber: string | null; callId: string; callControlId: string },
  now: string,
): Promise<boolean> {
  if (!a.orgId || !a.agentId || !a.businessPhone || !a.customerNumber) return false;
  // Per-PHONE rate limit: one missed-call auto-text per caller per 60 minutes,
  // across ALL their calls. The per-call claim below dedupes within a single
  // call, but a caller retrying 5 times in 20 minutes got 5 texts - pure spam.
  // The MISSED_CALL_SMS_SENT event row (joined through calls.customer_number)
  // IS the stored last-sent timestamp for the number.
  const rateWindow = await queryFirst<{ ts: string }>(
    env.D1DB,
    `SELECT ce.timestamp AS ts FROM call_events ce
       JOIN calls c ON c.id = ce.call_id
      WHERE ce.event_type = 'MISSED_CALL_SMS_SENT'
        AND c.org_id = ? AND c.customer_number = ?
        AND ce.timestamp > ?
      LIMIT 1`,
    a.orgId, a.customerNumber, new Date(Date.now() - 60 * 60_000).toISOString(),
  );
  if (rateWindow) {
    console.log(`[missed-call] rate-limited: skipping auto-response to ${a.customerNumber} (last sent ${rateWindow.ts}, call ${a.callId})`);
    return false;
  }
  // Atomic claim BEFORE sending: the anchor-hangup and fork-exhausted paths
  // can process within milliseconds of each other, and a check-then-send race
  // let both through (the caller got the text twice). provider_event_id is
  // UNIQUE, so exactly one path wins this insert.
  const claim = await execute(
    env.D1DB,
    `INSERT OR IGNORE INTO call_events (id, call_id, event_type, timestamp, payload, provider_event_id)
     VALUES (?, ?, 'MISSED_CALL_SMS_SENT', ?, ?, ?)`,
    crypto.randomUUID(), a.callId, now,
    JSON.stringify({ to: a.customerNumber, from: a.businessPhone }),
    `${a.callControlId}-missed-sms`,
  );
  if (claim.meta.changes === 0) return false;
  // Helper to release the claim when a gate below declines the send or the
  // provider call fails, so a later legitimate path can still text the caller.
  const releaseClaim = () =>
    execute(env.D1DB, `DELETE FROM call_events WHERE provider_event_id = ?`, `${a.callControlId}-missed-sms`);

  const ar = await queryFirst<{ enabled: number; missed_call_enabled: number; missed_call_message: string }>(
    env.D1DB,
    `SELECT enabled, missed_call_enabled, missed_call_message FROM auto_response_settings WHERE user_id = ?`,
    a.agentId,
  );
  if (ar && (!ar.enabled || !ar.missed_call_enabled)) {
    await releaseClaim();
    return false;
  }
  if (await isPhoneSuppressed(env, a.orgId, a.customerNumber)) {
    await releaseClaim();
    return false;
  }

  const cfg = await queryFirst<{ missed_call_sms_template: string }>(
    env.D1DB, `SELECT missed_call_sms_template FROM calling_configurations WHERE org_id = ?`, a.orgId,
  );
  const rawTemplate = (ar?.missed_call_message && ar.missed_call_message.trim())
    || cfg?.missed_call_sms_template
    || "Sorry we missed your call! Reply here and we'll help you right away.";
  const agentRow = await queryFirst<{ name: string | null }>(
    env.D1DB, `SELECT name FROM "user" WHERE id = ?`, a.agentId,
  );
  // Consented callers get the bare message; only unknown/cold numbers carry
  // the STOP footer.
  const callerLead = await queryFirst<{ sms_consent_status: string | null }>(
    env.D1DB, `SELECT sms_consent_status FROM lead WHERE org_id = ? AND phone = ? LIMIT 1`,
    a.orgId, a.customerNumber,
  );
  const template = appendComplianceFooter(rawTemplate, {
    kind: "first_auto",
    agentName: agentRow?.name ?? null,
    recipientOptedIn: callerLead?.sms_consent_status === "opted_in",
  });
  try {
    await mockTelnyxSendSms(
      env, a.businessPhone, a.customerNumber, template,
      { orgId: a.orgId },
      { ...(env.TELNYX_MESSAGING_PROFILE_ID ? { messagingProfileId: env.TELNYX_MESSAGING_PROFILE_ID } : {}) },
    );
    return true;
  } catch {
    await releaseClaim();
    return false;
  }
}

/**
 * Missed-call follow-through: a bell/push notification + a call-back task for
 * the agent. Used by BOTH miss paths - the "nobody to ring" voicemail divert
 * (which ends COMPLETED, so handleHangup's NO_ANSWER path never sees it) and
 * the rang-but-unanswered hangup. Idempotent per call via the
 * MISSED_CALL_LOGGED call_event so the paths never double-log.
 */
async function recordMissedCall(
  env: Env,
  a: { orgId: number | null; agentId: number | null; leadId: number | null; customerNumber: string | null; callId: string; callControlId: string },
  now: string,
): Promise<void> {
  if (!a.orgId || !a.agentId) return;
  // Per-PHONE rate limit (mirrors the auto-text): one missed-call
  // notification + call-back task per caller per 60 minutes. A caller
  // retrying repeatedly created a task pile-up; the bell/call history still
  // records every individual call.
  if (a.customerNumber) {
    const recent = await queryFirst<{ ts: string }>(
      env.D1DB,
      `SELECT ce.timestamp AS ts FROM call_events ce
         JOIN calls c ON c.id = ce.call_id
        WHERE ce.event_type = 'MISSED_CALL_LOGGED'
          AND c.org_id = ? AND c.customer_number = ?
          AND ce.timestamp > ?
        LIMIT 1`,
      a.orgId, a.customerNumber, new Date(Date.now() - 60 * 60_000).toISOString(),
    );
    if (recent) {
      console.log(`[missed-call] rate-limited: notification/task for ${a.customerNumber} already logged at ${recent.ts} (call ${a.callId})`);
      return;
    }
  }
  // Atomic claim BEFORE notifying: concurrent miss paths (anchor hangup +
  // fork exhausted) raced the old check-then-insert and double-fired the
  // notification + task. provider_event_id is UNIQUE; one path wins.
  // (MISSED_CALL_LOGGED also had to be added to the call_events event_type
  // CHECK - it was missing, so this row was silently dropped and the dedupe
  // never held at all.)
  const claim = await execute(
    env.D1DB,
    `INSERT OR IGNORE INTO call_events (id, call_id, event_type, timestamp, payload, provider_event_id)
     VALUES (?, ?, 'MISSED_CALL_LOGGED', ?, ?, ?)`,
    crypto.randomUUID(), a.callId, now,
    JSON.stringify({ from: a.customerNumber }),
    `${a.callControlId}-missed-log`,
  );
  if (claim.meta.changes === 0) return;
  const leadRow = a.leadId
    ? await queryFirst<{ name: string | null }>(env.D1DB, `SELECT name FROM lead WHERE id = ?`, a.leadId)
    : null;
  const caller = (leadRow?.name && leadRow.name.trim()) || a.customerNumber || "Unknown caller";
  try {
    await notify(env, {
      userId: a.agentId,
      orgId: a.orgId,
      kind: "call_missed",
      channel: "call",
      contactId: a.leadId ?? undefined,
      title: `Missed call from ${caller}`,
      body: a.customerNumber || undefined,
      severity: "warning",
      data: { path: `/inbox?tab=calls`, call_id: a.callId, from_number: a.customerNumber },
    });
  } catch (err) {
    console.warn("[missed-call] notify failed", err);
  }
  try {
    await createTask(env, {
      orgId: a.orgId,
      userId: a.agentId,
      leadId: a.leadId ?? null,
      title: `Call back ${caller}`,
      description: `Missed inbound call${a.customerNumber ? ` from ${a.customerNumber}` : ""}.`,
      why: "They called you - missed calls are the hottest follow-ups.",
      recommendation: "Call back as soon as possible.",
      type: "call",
      priority: "high",
      source: "ai",
    });
  } catch (err) {
    console.warn("[missed-call] task failed", err);
  }
}

/**
 * Inbound call landed on one of our DIDs. Look up the assigned agent, gate on
 * busy-on-busy + workspace calling_enabled, answer the anchor leg, then dial
 * the fork legs per ring_strategy. Persist sids + seed the CallActorDO so the
 * `call.answered` race in handleAnswered can resolve a winner. Push
 * `incoming_call` to the agent's WS so the modal opens.
 */
async function handleIncomingInitiated(env: Env, payload: TelnyxPayload, callControlId: string, requestUrl: string): Promise<void> {
  if (!payload.from || !payload.to) return;

  // The web fork's INVITE toward the agent's WebRTC credential surfaces as its
  // own `incoming` call.initiated (to = sip:gencred...@sip.telnyx.com). That
  // leg belongs to OUR dial - falling through to the unknown-DID rejection
  // below issued a hangup against the very leg ringing the browser. Only
  // E.164 destinations are real inbound business calls.
  if (!payload.to.startsWith("+")) return;

  const businessNumber = await queryFirst<{ id: string; org_id: number; assigned_to_user_id: number | null }>(
    env.D1DB,
    `SELECT id, org_id, assigned_to_user_id FROM phone_numbers WHERE phone_number = ?`,
    payload.to,
  );
  if (!businessNumber || !businessNumber.assigned_to_user_id) {
    await hangup(env, callControlId);
    return;
  }

  const agent = await queryFirst<{ id: number; agent_phone_number: string | null; telnyx_sip_uri: string | null }>(
    env.D1DB,
    `SELECT id, agent_phone_number, telnyx_sip_uri FROM "user" WHERE id = ?`,
    businessNumber.assigned_to_user_id,
  );
  if (!agent) {
    await hangup(env, callControlId);
    return;
  }

  // Busy-on-busy: agent already on another live call -> hang up; the hangup
  // webhook will trigger the missed-call SMS path in handleHangup.
  const busy = await queryFirst<{ id: string }>(
    env.D1DB,
    `SELECT id FROM calls WHERE agent_id = ? AND status = 'IN_PROGRESS' LIMIT 1`,
    agent.id,
  );
  if (busy) {
    await hangup(env, callControlId);
    return;
  }

  const cfg = await queryFirst<{
    ring_timeout: number; ring_strategy: string; calling_enabled: number;
    voicemail_enabled: number; voicemail_greeting: string;
  }>(
    env.D1DB,
    `SELECT ring_timeout, ring_strategy, calling_enabled, voicemail_enabled, voicemail_greeting
       FROM calling_configurations WHERE org_id = ?`,
    businessNumber.org_id,
  );
  if (cfg && cfg.calling_enabled !== 1) {
    await hangup(env, callControlId);
    return;
  }
  const ringTimeout = cfg?.ring_timeout ?? 25;
  const ringStrategy = cfg?.ring_strategy ?? "parallel";

  // Find or create a lead by caller phone. Calling the business IS consent
  // to be texted back (the caller initiated contact), so inbound callers are
  // recorded opted-in - their auto-texts go out without the STOP footer. An
  // explicit prior opt-out (STOP) is never overridden by a call.
  const existingLead = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM lead WHERE org_id = ? AND phone = ? LIMIT 1`,
    businessNumber.org_id, payload.from,
  );
  const leadId: number = existingLead
    ? existingLead.id
    : Number((await execute(
        env.D1DB,
        `INSERT INTO lead (name, phone, status, owner_id, org_id, sms_consent_status, created_at, updated_at)
         VALUES (NULL, ?, 'New', ?, ?, 'opted_in', ?, ?)`,
        payload.from, agent.id, businessNumber.org_id, nowIso(), nowIso(),
      )).meta.last_row_id);
  if (existingLead) {
    await execute(
      env.D1DB,
      `UPDATE lead SET sms_consent_status = 'opted_in', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND COALESCE(sms_opt_out, 0) = 0
          AND (sms_consent_status IS NULL OR sms_consent_status NOT IN ('opted_in', 'opted_out'))`,
      existingLead.id,
    );
  }

  const callId = crypto.randomUUID();
  await execute(
    env.D1DB,
    `INSERT INTO calls
       (id, provider_call_sid, direction, status, from_number, to_number,
        lead_id, agent_id, business_number_id, customer_number,
        origin, org_id, initiated_at, ringing_at, created_at, updated_at)
     VALUES (?, ?, 'INBOUND', 'RINGING', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    callId, callControlId, payload.from, payload.to,
    leadId, agent.id, businessNumber.id, payload.from,
    businessNumber.org_id, nowIso(), nowIso(), nowIso(), nowIso(),
  );

  // Deliberately DO NOT answer the anchor here. Answering up front put the
  // caller in dead silence while the agent's browser rang (~6s of "is this
  // thing on?"). Left unanswered, the caller hears normal ringback; the anchor
  // is answered the moment a fork leg wins (handleAnswered) or when diverting
  // to voicemail.
  const origin = new URL(requestUrl).origin;
  const webhookUrl = `${origin}/api/webhooks/calling/telnyx/status`;
  // NOTE: the Dial API (/v2/calls) only accepts a CALL CONTROL APP id - passing
  // the credential SIP connection id fails with Telnyx 10015 (which silently
  // killed web ringing). The SIP URI still routes to the agent's registered
  // browser; the dial just has to originate from the Call Control App.
  const wantsWeb = ringStrategy !== "phone_first" && !!agent.telnyx_sip_uri && !!env.TELNYX_CONNECTION_ID;
  const wantsPhone = ringStrategy !== "web_first" && !!agent.agent_phone_number && !!env.TELNYX_CONNECTION_ID;

  let webLegSid: string | null = null;
  let phoneLegSid: string | null = null;

  if (wantsWeb && agent.telnyx_sip_uri) {
    const dialed = await dialForkLeg(env, {
      from: payload.to,
      to: agent.telnyx_sip_uri,
      connectionId: env.TELNYX_CONNECTION_ID,
      anchorCallControlId: callControlId,
      timeoutSecs: ringTimeout,
      leg: "web",
      callId,
      webhookUrl,
    });
    if (dialed.ok) webLegSid = dialed.data.call_control_id;
    else console.warn("[fork] web leg dial failed", dialed.error?.message ?? dialed.error);
  }
  if (wantsPhone && agent.agent_phone_number) {
    const dialed = await dialForkLeg(env, {
      from: payload.to,
      to: agent.agent_phone_number,
      connectionId: env.TELNYX_CONNECTION_ID,
      anchorCallControlId: callControlId,
      timeoutSecs: ringTimeout,
      leg: "phone",
      callId,
      webhookUrl,
    });
    if (dialed.ok) phoneLegSid = dialed.data.call_control_id;
  }

  if (!webLegSid && !phoneLegSid) {
    // Nobody to ring (browser dialer not registered + no phone leg). Always text
    // the caller back so the lead never hits a dead end, THEN divert to voicemail
    // if enabled, else hang up. Without this the self-hangup records as COMPLETED
    // (not NO_ANSWER), so the call.hangup missed-call path would never fire.
    await sendMissedCallTextback(env, {
      orgId: businessNumber.org_id, agentId: agent.id,
      businessPhone: payload.to ?? null, customerNumber: payload.from ?? null,
      callId, callControlId,
    }, nowIso());
    // The agent must still LEARN about the call: missed-call notification +
    // call-back task (this path ends COMPLETED, so handleHangup's NO_ANSWER
    // notify never fires for it).
    await recordMissedCall(env, {
      orgId: businessNumber.org_id, agentId: agent.id, leadId,
      customerNumber: payload.from ?? null, callId, callControlId,
    }, nowIso());
    // If voicemail is enabled, answer the (still-ringing) anchor and divert it
    // to a greeting + recording instead of dropping the caller.
    if (cfg?.voicemail_enabled === 1) {
      try {
        await executeCallControl(env, callControlId, { command: "answer" });
        await executeCallControl(env, callControlId, {
          command: "speak", payload: cfg.voicemail_greeting, voice: "female", language: "en-US",
        });
        await startRecording(env, callControlId);
        await execute(
          env.D1DB,
          `UPDATE calls SET provider_metadata = json_set(COALESCE(provider_metadata, '{}'), '$.awaitingVoicemail', json('true')), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          callId,
        );
        return;
      } catch (err) {
        console.warn("[voicemail] direct divert failed", err);
      }
    }
    await hangup(env, callControlId);
    return;
  }

  await execute(
    env.D1DB,
    `UPDATE calls SET web_leg_sid = ?, phone_leg_sid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    webLegSid, phoneLegSid, callId,
  );

  if (env.GATEWAY) {
    await env.GATEWAY.fetch(`http://gw/do/callActor/call:${callId}/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callId,
        anchorCallControlId: callControlId,
        webLegSid, phoneLegSid,
        stage: "RINGING_FORK",
      }),
    });

    await env.GATEWAY.fetch(`http://gw/do/userSocket/user:${agent.id}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "incoming_call",
        data: {
          callId,
          fromNumber: payload.from,
          leadId: String(leadId),
          businessNumber: payload.to,
          ringStrategy,
          at: nowIso(),
        },
      }),
    });
  }

  // Bell-list + push when the agent isn't actively connected. The live
  // `incoming_call` WS event above drives the ringing modal; this surfaces the
  // event in history regardless of whether the call was answered.
  try {
    const leadRow = await queryFirst<{ name: string | null }>(
      env.D1DB, `SELECT name FROM lead WHERE id = ?`, leadId,
    );
    const caller = (leadRow?.name && leadRow.name.trim()) || payload.from;
    await notify(env, {
      userId: agent.id,
      orgId: businessNumber.org_id,
      kind: "call_incoming",
      channel: "call",
      contactId: leadId,
      title: `Incoming call from ${caller}`,
      body: payload.from,
      severity: "info",
      data: { path: `/inbox?tab=calls`, call_id: callId, from_number: payload.from },
      // The ringing modal handles in-app; out-of-app push helps catch missed
      // calls on a backgrounded tab / mobile.
    });
  } catch (err) {
    console.warn("[call-incoming] notify failed", err);
  }
}

/**
 * Browser placed a WebRTC outbound call. We have a placeholder row keyed by
 * `pending-web-<callId>`; attach the real call_control_id.
 */
async function handleOutgoingInitiated(env: Env, payload: TelnyxPayload, callControlId: string): Promise<void> {
  // Match by either: (a) X-WC-Call-Id custom header, or (b) the SIP from-uri
  // pointing back to an agent we know.
  const wcCallId = payload.custom_headers?.find((h) => h.name === "X-WC-Call-Id")?.value;
  if (wcCallId) {
    const row = await queryFirst<{ id: string; provider_call_sid: string }>(
      env.D1DB,
      `SELECT id, provider_call_sid FROM calls WHERE id = ?`,
      wcCallId,
    );
    if (row && row.provider_call_sid.startsWith("pending-web-")) {
      await execute(
        env.D1DB,
        `UPDATE calls SET provider_call_sid = ?, status = 'RINGING', ringing_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        callControlId, nowIso(), wcCallId,
      );
      await emitState(env, wcCallId, { status: "RINGING", direction: "OUTBOUND", origin: "web" });
    }
  }
}

/**
 * Either a fork-leg winner (parallel ring) or an agent-first PSTN answer.
 * The `client_state` payload distinguishes them.
 */
async function handleAnswered(env: Env, payload: TelnyxPayload, callControlId: string): Promise<void> {
  const cs = decodeClientState(payload.client_state);
  if (cs?.kind === "fork_leg" && cs.callId) {
    // Atomic winner claim via CallActorDO.
    const claim = await gatewayFetch<{ won: boolean; loserSid?: string | null; anchorSid?: string }>(
      env, `/do/callActor/call:${cs.callId}/claim-winner`, "POST", { leg: cs.leg },
    );
    if (!claim?.won) {
      // Lost the race - hangup our (losing) leg.
      await hangup(env, callControlId);
      return;
    }
    const anchor = claim.anchorSid ?? cs.anchor;
    // Audio is no longer gated on this webhook: the fork was dialed with
    // link_to + bridge_on_answer, so Telnyx answered the anchor and bridged at
    // the media layer the moment the leg picked up. Re-answering/re-bridging
    // here on EVERY answer stomped on that fresh bridge ~300ms in - the
    // re-bridge forces a media renegotiation on the WebRTC leg (ICE restart),
    // which is seconds of dead air right after connecting. Only repair when a
    // second fork leg exists (claim.loserSid): in that race the losing leg may
    // have answered second and stolen the auto-bridge, so re-bridge the
    // claimed winner before hanging the loser up.
    if (anchor && claim.loserSid) {
      try {
        await executeCallControl(env, anchor, { command: "answer" });
      } catch {
        /* already answered by the auto-bridge - expected */
      }
      const bridged = await bridge(env, anchor, callControlId);
      if (!bridged.ok) {
        // The answer may still be settling - one short retry covers the race.
        await new Promise((r) => setTimeout(r, 400));
        const retry = await bridge(env, anchor, callControlId);
        if (!retry.ok) console.warn("[bridge] failed after retry", retry.error?.message);
      }
    }
    if (claim.loserSid) await hangup(env, claim.loserSid);
    await execute(
      env.D1DB,
      `UPDATE calls SET answered_via = ?, status = 'IN_PROGRESS', answered_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      cs.leg, nowIso(), cs.callId,
    );
    if (anchor) await maybeStartRecording(env, cs.callId, anchor);
    await emitState(env, cs.callId, { status: "IN_PROGRESS", answeredVia: cs.leg });
    // Tell every other tab/device the call was picked up so their ringing
    // modal stops (the answering tab's modal already became the active call).
    const callRow = await queryFirst<{ agent_id: number | null }>(
      env.D1DB, `SELECT agent_id FROM calls WHERE id = ?`, cs.callId,
    );
    if (callRow?.agent_id) {
      await gatewayFetch(env, `/do/userSocket/user:${callRow.agent_id}/emit`, "POST", {
        event: "call_taken_elsewhere",
        data: { callId: cs.callId, answeredVia: cs.leg },
      });
    }
    return;
  }

  // Agent-first PSTN: bridge customer in.
  const call = await queryFirst<{ id: string; provider_metadata: string | null }>(
    env.D1DB, `SELECT id, provider_metadata FROM calls WHERE provider_call_sid = ?`, callControlId,
  );
  if (!call) return;
  let meta: { stage?: string; customerNumber?: string } = {};
  try { meta = JSON.parse(call.provider_metadata || "{}"); } catch { /* ignore */ }
  if (meta.stage === "DIALING_AGENT" && meta.customerNumber) {
    // Transfer the customer into the agent's leg.
    await fetch(`https://api.telnyx.com/v2/calls/${encodeURIComponent(callControlId)}/actions/transfer`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: meta.customerNumber }),
    });
    await execute(
      env.D1DB,
      `UPDATE calls SET status = 'IN_PROGRESS', answered_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      nowIso(), call.id,
    );
    await maybeStartRecording(env, call.id, callControlId);
    await emitState(env, call.id, { status: "IN_PROGRESS", direction: "OUTBOUND", origin: "phone" });
  }
}

/**
 * Terminal event. Write status, duration, usage_record. For inbound missed
 * calls, send the missed-call SMS via the agent's business number. Emit a
 * terminal `call_state` so the UI clears the call window.
 */
async function handleHangup(env: Env, payload: TelnyxPayload, callControlId: string): Promise<void> {
  const call = await queryFirst<CallTerminalRow>(
    env.D1DB,
    `SELECT id, agent_id, org_id, lead_id, business_number_id, customer_number, direction, status,
            web_leg_sid, phone_leg_sid, answered_at
       FROM calls WHERE provider_call_sid = ? LIMIT 1`,
    callControlId,
  );
  if (!call) {
    // Not the anchor - might be a fork leg. If all fork legs are now exhausted
    // with no winner, divert the still-live anchor to voicemail (opt-in).
    await maybeDivertToVoicemail(env, callControlId);
    return;
  }

  const cause = String(payload.hangup_cause || "").toLowerCase();
  const status = mapHangupToStatus(call.status, cause);
  const now = nowIso();
  // Telnyx's call.hangup event does NOT include a duration field, so
  // call_duration_secs/duration_secs are virtually always absent -> 0, which was
  // leaving every call at duration=0 and skipping the usage_records insert below
  // (so calling minutes never accrued). Fall back to billable talk time computed
  // from the call's own timestamps: answered_at -> hangup. A call that was never
  // answered has no answered_at, so it correctly bills 0.
  let duration = Math.max(0, Number(payload.call_duration_secs ?? payload.duration_secs ?? 0));
  if (duration === 0 && call.answered_at) {
    const answeredMs = Date.parse(call.answered_at);
    const endMs = Date.parse(now);
    if (Number.isFinite(answeredMs) && endMs > answeredMs) {
      duration = Math.round((endMs - answeredMs) / 1000);
    }
  }

  // Anchor died while still ringing (caller gave up, or we ended it): stop the
  // ringing modal on every open tab AND kill the still-ringing fork legs at
  // Telnyx - without this the browser/cell keep ringing for a dead caller
  // until their own timeout. Terminal call_state below only clears the ACTIVE
  // call window, never the incoming-call ringer.
  if (call.direction === "INBOUND" && call.status === "RINGING") {
    if (call.agent_id) {
      await gatewayFetch(env, `/do/userSocket/user:${call.agent_id}/emit`, "POST", {
        event: "call_ring_ended",
        data: { callId: call.id, reason: cause || "hangup" },
      });
    }
    if (call.web_leg_sid) await hangup(env, call.web_leg_sid);
    if (call.phone_leg_sid) await hangup(env, call.phone_leg_sid);
  }

  await execute(
    env.D1DB,
    `UPDATE calls SET status = ?, duration = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    status, duration, now, call.id,
  );
  await execute(
    env.D1DB,
    `INSERT INTO call_events (id, call_id, event_type, timestamp, payload, provider_event_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(), call.id,
    status === "COMPLETED" ? "CALL_COMPLETED"
      : status === "NO_ANSWER" ? "CALL_NO_ANSWER"
      : status === "BUSY" ? "CALL_BUSY"
      : "CALL_FAILED",
    now, JSON.stringify({ duration, status }), `${callControlId}-completed`,
  );

  // Usage record (only when there's actual duration).
  if (status === "COMPLETED" && duration > 0) {
    const cycle = await ensureCycle(env, call.org_id);
    if (cycle) {
      const minutes = duration / 60;
      const cost = minutes * 0.02; // matches default overage rate; refined per-cycle later
      await execute(
        env.D1DB,
        `INSERT INTO usage_records (id, call_id, billing_cycle_id, org_id, agent_id, minutes, cost, is_overage, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        crypto.randomUUID(), call.id, cycle.id, call.org_id, call.agent_id, minutes, cost, now,
      );
      // If this call pushed the cycle over its minute pool, fire a one-shot
      // owner alert. notifyQuotaExceeded() is self-dedupe via the cycle's
      // limit_notified_at stamp, so repeated calls in the same overage will
      // not re-notify.
      const totals = await queryFirst<{ total: number; plan_minute_limit: number }>(
        env.D1DB,
        `SELECT COALESCE(SUM(ur.minutes), 0) AS total, bc.plan_minute_limit
           FROM billing_cycles bc
           LEFT JOIN usage_records ur ON ur.billing_cycle_id = bc.id
          WHERE bc.id = ?
          GROUP BY bc.id`,
        cycle.id,
      );
      if (totals && totals.total >= totals.plan_minute_limit) {
        await notifyQuotaExceeded(env, call.org_id, "voice");
      }
    }
  }

  // Missed-call SMS on inbound when no answer / busy / failed / caller gave up
  // mid-ring (CANCELED). Uses the shared idempotent helper - the "nobody to
  // ring" drop path may have already texted the caller, so this won't
  // double-send.
  if (call.direction === "INBOUND" && (status === "NO_ANSWER" || status === "BUSY" || status === "FAILED" || status === "CANCELED")) {
    const bn = call.business_number_id
      ? await queryFirst<{ phone_number: string }>(
          env.D1DB, `SELECT phone_number FROM phone_numbers WHERE id = ?`, call.business_number_id)
      : null;
    await sendMissedCallTextback(env, {
      orgId: call.org_id, agentId: call.agent_id,
      businessPhone: bn?.phone_number ?? null, customerNumber: call.customer_number ?? null,
      callId: call.id, callControlId,
    }, now);
    // Tell the agent it was a missed call (regardless of whether the text sent).
    await emitState(env, call.id, { status, terminal: true, missedWhileBusy: true });
  }

  await emitState(env, call.id, { status, duration, terminal: true });

  // Missed-call bell entry + push + call-back task (inbound only, when it
  // wasn't picked up). Idempotent with the "nobody to ring" path.
  if (
    call.direction === "INBOUND" &&
    (status === "NO_ANSWER" || status === "BUSY" || status === "FAILED" || status === "CANCELED")
  ) {
    await recordMissedCall(env, {
      orgId: call.org_id, agentId: call.agent_id, leadId: call.lead_id ?? null,
      customerNumber: call.customer_number ?? null, callId: call.id, callControlId,
    }, now);
  }

  // Tell the CallActorDO it can shed state.
  await gatewayFetch(env, `/do/callActor/call:${call.id}/terminate`, "POST", {});
}

// ---------- helpers ----------

function mapHangupToStatus(currentStatus: string, cause: string): string {
  if (currentStatus === "IN_PROGRESS") return "COMPLETED";
  if (cause === "no_answer" || cause === "no-answer" || cause === "timeout") return "NO_ANSWER";
  if (cause === "busy" || cause === "user_busy") return "BUSY";
  if (cause === "call_rejected" || cause === "rejected") return "BUSY";
  if (cause === "originator_cancel") return "CANCELED";
  if (cause === "normal_clearing" || cause === "normal") return "COMPLETED";
  return "FAILED";
}

function decodeClientState(raw: string | undefined): { kind?: string; leg?: "web" | "phone"; anchor?: string; callId?: string } | null {
  if (!raw) return null;
  try { return JSON.parse(atob(raw)); } catch { return null; }
}

async function ensureCycle(env: Env, orgId: number): Promise<{ id: string } | null> {
  const existing = await queryFirst<{ id: string }>(
    env.D1DB,
    `SELECT id FROM billing_cycles WHERE org_id = ? AND status = 'ACTIVE' ORDER BY start_date DESC LIMIT 1`,
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
  await execute(
    env.D1DB,
    `INSERT INTO billing_cycles (id, org_id, start_date, end_date, status, plan_minute_limit, overage_rate)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, 0.02)`,
    id, orgId, start.toISOString(), end.toISOString(), planMinuteLimit(orgPlanRow?.plan),
  );
  return { id };
}

async function emitState(env: Env, callId: string, partial: Record<string, unknown>): Promise<void> {
  // Look up the call's agent so we know which UserSocketDO to ping.
  const row = await queryFirst<{ agent_id: number }>(
    env.D1DB, `SELECT agent_id FROM calls WHERE id = ?`, callId,
  );
  if (!row) return;
  await gatewayFetch(env, `/do/userSocket/user:${row.agent_id}/emit`, "POST", {
    event: "call_state",
    data: { callId, ...partial },
  });
}

async function gatewayFetch<T = unknown>(
  env: Env,
  path: string,
  method: "GET" | "POST",
  body: unknown,
): Promise<T | null> {
  if (!env.GATEWAY) return null;
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (method === "POST") init.body = JSON.stringify(body);
  try {
    const res = await env.GATEWAY.fetch(`http://gw${path}`, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---------- types ----------

type TelnyxPayload = {
  call_control_id?: string;
  direction?: "incoming" | "outgoing";
  from?: string;
  to?: string;
  client_state?: string;
  custom_headers?: Array<{ name: string; value: string }>;
  hangup_cause?: string;
  call_duration_secs?: number;
  duration_secs?: number;
  // call.recording.saved
  recording_id?: string;
  recording_session_id?: string;
  recording_urls?: { mp3?: string; wav?: string };
  public_recording_urls?: { mp3?: string; wav?: string };
};

type TelnyxEvent = {
  id?: string;
  event_type?: string;
  payload?: TelnyxPayload;
  data?: {
    id?: string;
    event_type?: string;
    payload?: TelnyxPayload;
  };
};

type CallTerminalRow = {
  id: string;
  agent_id: number;
  org_id: number;
  lead_id: number | null;
  business_number_id: string | null;
  customer_number: string | null;
  direction: "OUTBOUND" | "INBOUND";
  status: string;
  web_leg_sid: string | null;
  phone_leg_sid: string | null;
  answered_at: string | null;
};
