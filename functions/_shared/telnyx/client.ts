/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../env.ts";

/**
 * Thin Telnyx REST client for Workers using `fetch`. Same pattern as
 * functions/_shared/stripe.ts: one low-level call helper + typed methods.
 *
 * Covers Call Control (answer/transfer/bridge/hangup/dial), Messaging (missed-
 * call SMS), Number Orders (provisioning), and WebRTC SIP credentials + login
 * tokens. No Node SDK.
 */

const TELNYX_BASE = "https://api.telnyx.com/v2";

type TelnyxResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: { message: string; code?: string } };

async function telnyxCall<T = unknown>(
  env: Env,
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: Record<string, unknown>; raw?: boolean } = {},
): Promise<TelnyxResult<T>> {
  if (!env.TELNYX_API_KEY) {
    return { ok: false, status: 503, error: { message: "TELNYX_API_KEY not configured" } };
  }
  const method = init.method ?? (init.body ? "POST" : "GET");
  const headers: Record<string, string> = { Authorization: `Bearer ${env.TELNYX_API_KEY}` };
  const reqInit: RequestInit = { method, headers };
  if (init.body && method !== "GET") {
    headers["Content-Type"] = "application/json";
    reqInit.body = JSON.stringify(init.body);
  }

  const res = await fetch(`${TELNYX_BASE}${path}`, reqInit);
  const text = await res.text();

  // The login-token endpoint returns a bare JWT string, not JSON.
  if (init.raw) {
    if (!res.ok) return { ok: false, status: res.status, error: { message: text || `Telnyx ${res.status}` } };
    return { ok: true, data: text.trim() as unknown as T };
  }

  let parsed: unknown = {};
  try { parsed = JSON.parse(text); } catch { /* keep empty */ }
  if (!res.ok) {
    const errs = (parsed as { errors?: Array<{ detail?: string; code?: string }> }).errors;
    const first = errs?.[0];
    const errOut: { message: string; code?: string } = {
      message: first?.detail ?? `Telnyx ${res.status}`,
    };
    if (first?.code) errOut.code = first.code;
    return { ok: false, status: res.status, error: errOut };
  }
  return { ok: true, data: (parsed as { data?: T }).data as T };
}

// ---------- Call Control ----------

/** Place an outbound call (PSTN agent-first or generic). Returns call_control_id. */
export async function dial(
  env: Env,
  params: {
    to: string;
    from: string;
    connectionId: string;
    timeoutSecs?: number;
    webhookUrl?: string;
    clientState?: string;
    customHeaders?: Array<{ name: string; value: string }>;
  },
): Promise<TelnyxResult<{ call_control_id: string; state?: string }>> {
  const body: Record<string, unknown> = {
    connection_id: params.connectionId,
    to: params.to,
    from: params.from,
    timeout_secs: params.timeoutSecs ?? 30,
  };
  if (params.webhookUrl) body.webhook_url = params.webhookUrl;
  if (params.clientState) body.client_state = params.clientState;
  if (params.customHeaders) body.custom_headers = params.customHeaders;
  return telnyxCall(env, "/calls", { body });
}

/** Dial one fork leg of a parallel ring; encodes `client_state` so the webhook can tell legs apart. */
export async function dialForkLeg(
  env: Env,
  params: {
    from: string;
    to: string;
    connectionId: string;
    anchorCallControlId: string;
    timeoutSecs: number;
    leg: "web" | "phone";
    callId: string;
    webhookUrl: string;
  },
): Promise<TelnyxResult<{ call_control_id: string }>> {
  const clientState = base64Encode(JSON.stringify({
    kind: "fork_leg",
    leg: params.leg,
    anchor: params.anchorCallControlId,
    callId: params.callId,
  }));
  return telnyxCall(env, "/calls", {
    body: {
      connection_id: params.connectionId,
      to: params.to,
      from: params.from,
      timeout_secs: params.timeoutSecs,
      webhook_url: params.webhookUrl,
      client_state: clientState,
      // Bridge to the (still-ringing) anchor the INSTANT this leg answers -
      // Telnyx answers the anchor as part of the bridge. Without this, audio
      // had to wait for the call.answered webhook to reach our server plus two
      // sequential API calls (answer + bridge) - a multi-second silence after
      // pickup. handleAnswered keeps its answer/bridge as a repair path for
      // answer races, but it is no longer in the audio path.
      link_to: params.anchorCallControlId,
      bridge_on_answer: true,
    },
  });
}

type CallControlCommand = {
  command: "answer" | "transfer" | "hangup" | "speak";
  to?: string;
  from?: string;
  timeout_secs?: number;
  webhook_url?: string;
  payload?: string;
  voice?: string;
  language?: string;
};

/** Issue a Call Control action (answer/transfer/hangup/speak) on a live call. */
export async function executeCallControl(
  env: Env,
  callControlId: string,
  command: CallControlCommand,
): Promise<TelnyxResult<unknown>> {
  const { command: action, ...body } = command;
  return telnyxCall(env, `/calls/${encodeURIComponent(callControlId)}/actions/${action}`, {
    body: body as Record<string, unknown>,
  });
}

/** Bridge two already-up legs (anchor + winning fork). */
export async function bridge(
  env: Env,
  anchorCallControlId: string,
  targetCallControlId: string,
): Promise<TelnyxResult<unknown>> {
  return telnyxCall(env, `/calls/${encodeURIComponent(anchorCallControlId)}/actions/bridge`, {
    body: { call_control_id: targetCallControlId },
  });
}

/** Hang up a leg. Swallows "already hung up" errors (non-fatal). */
export async function hangup(env: Env, callControlId: string): Promise<void> {
  await telnyxCall(env, `/calls/${encodeURIComponent(callControlId)}/actions/hangup`, { body: {} });
}

/**
 * Start recording a live call. Telnyx emits `call.recording.saved` (async,
 * seconds after hangup) with the recording URLs. Dual-channel mp3 gives Whisper
 * better speaker separation.
 */
export async function startRecording(env: Env, callControlId: string): Promise<TelnyxResult<unknown>> {
  return telnyxCall(env, `/calls/${encodeURIComponent(callControlId)}/actions/record_start`, {
    body: { format: "mp3", channels: "dual" },
  });
}

/**
 * Download a Telnyx recording (the time-limited URL from call.recording.saved).
 * Returns the raw bytes for re-upload to R2. Uses the API key bearer header.
 */
export async function downloadRecording(env: Env, url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${env.TELNYX_API_KEY}` } });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// ---------- Messaging (missed-call SMS) ----------

export async function sendSms(
  env: Env,
  params: { from: string; to: string; text: string },
): Promise<TelnyxResult<{ id: string; status?: string }>> {
  return telnyxCall(env, "/messages", {
    body: {
      from: params.from,
      to: params.to,
      text: params.text,
      messaging_profile_id: env.TELNYX_MESSAGING_PROFILE_ID || undefined,
    },
  });
}

// ---------- Number provisioning (search -> order) ----------

export async function searchAvailableNumbers(
  env: Env,
  params: { areaCode: string; country?: string; limit?: number },
): Promise<TelnyxResult<Array<{ phone_number: string }>>> {
  const qs = new URLSearchParams();
  qs.set("filter[national_destination_code]", params.areaCode);
  qs.set("filter[country_code]", params.country ?? "US");
  qs.append("filter[features][]", "voice");
  qs.append("filter[features][]", "sms");
  qs.set("filter[limit]", String(params.limit ?? 5));
  return telnyxCall(env, `/available_phone_numbers?${qs.toString()}`);
}

export async function orderNumber(
  env: Env,
  phoneNumber: string,
): Promise<TelnyxResult<{ id: string; phone_numbers?: Array<{ id: string; phone_number: string }> }>> {
  return telnyxCall(env, "/number_orders", {
    body: {
      phone_numbers: [{ phone_number: phoneNumber }],
      connection_id: env.TELNYX_CONNECTION_ID || undefined,
      messaging_profile_id: env.TELNYX_MESSAGING_PROFILE_ID || undefined,
    },
  });
}

export async function releaseNumber(env: Env, providerSid: string): Promise<void> {
  await telnyxCall(env, `/phone_numbers/${encodeURIComponent(providerSid)}`, { method: "DELETE" });
}

// ---------- WebRTC SIP credentials + login tokens ----------

export async function createCredential(
  env: Env,
  params: { name: string; tag?: string },
): Promise<TelnyxResult<{ id: string; sip_username: string }>> {
  if (!env.TELNYX_CREDENTIAL_CONNECTION_ID) {
    return { ok: false, status: 503, error: { message: "TELNYX_CREDENTIAL_CONNECTION_ID not configured" } };
  }
  return telnyxCall(env, "/telephony_credentials", {
    body: {
      connection_id: env.TELNYX_CREDENTIAL_CONNECTION_ID,
      name: params.name,
      tag: params.tag,
    },
  });
}

export async function deleteCredential(env: Env, credentialId: string): Promise<void> {
  await telnyxCall(env, `/telephony_credentials/${encodeURIComponent(credentialId)}`, { method: "DELETE" });
}

/** Mint a short-lived JWT the @telnyx/webrtc SDK uses to register the browser as a SIP endpoint. */
export async function createOnDemandToken(env: Env, credentialId: string): Promise<TelnyxResult<string>> {
  return telnyxCall<string>(env, `/telephony_credentials/${encodeURIComponent(credentialId)}/token`, {
    method: "POST",
    body: {},
    raw: true,
  });
}

// ---------- helpers ----------

function base64Encode(s: string): string {
  // btoa is available in the Workers runtime.
  return btoa(unescape(encodeURIComponent(s)));
}

/** Map a Telnyx event type / state onto our CallStatus enum. */
export function mapTelnyxStatus(input: string | undefined): string {
  if (!input) return "INITIATED";
  const v = input.toLowerCase();
  if (v.includes("call.initiated")) return "INITIATED";
  if (v.includes("call.bridged")) return "IN_PROGRESS";
  if (v.includes("call.answered")) return "IN_PROGRESS";
  if (v.includes("call.hangup")) return "COMPLETED";
  if (v === "parked" || v === "ringing") return "RINGING";
  if (v === "bridged") return "IN_PROGRESS";
  if (v === "answered") return "IN_PROGRESS";
  if (v === "busy") return "BUSY";
  if (v === "no-answer" || v === "no_answer") return "NO_ANSWER";
  if (v === "failed") return "FAILED";
  if (v === "completed" || v === "hangup") return "COMPLETED";
  return "INITIATED";
}
