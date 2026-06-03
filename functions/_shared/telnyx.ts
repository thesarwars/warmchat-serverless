/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";

/**
 * Telnyx REST client (10DLC SMS + brand/campaign provisioning). Same pattern
 * as `stripe.ts` - typed `fetch` wrapper with bearer auth.
 *
 * Reference: https://developers.telnyx.com/api/
 */

export type TelnyxResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; status: number; raw?: unknown } };

interface TelnyxCallOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const BASE = "https://api.telnyx.com";

function buildQuery(q?: Record<string, string | number | boolean | undefined>): string {
  if (!q) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const s = params.toString();
  return s ? "?" + s : "";
}

export async function telnyxCall<T = unknown>(
  env: Env, path: string, opts: TelnyxCallOpts = {},
): Promise<TelnyxResult<T>> {
  if (!env.TELNYX_API_KEY) {
    return { ok: false, error: { message: "Telnyx not configured", status: 503 } };
  }
  const res = await fetch(`${BASE}${path}${buildQuery(opts.query)}`, {
    method: opts.method || (opts.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${env.TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
  });
  const text = await res.text();
  const json = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
  if (!res.ok) {
    const msg = (json as { errors?: Array<{ detail?: string }> } | null)?.errors?.[0]?.detail
      || `Telnyx ${path} returned ${res.status}`;
    return { ok: false, error: { message: msg, status: res.status, raw: json } };
  }
  return { ok: true, data: (json as { data: T } | null)?.data as T };
}

export type AssignCampaignResult = TelnyxResult<{ campaignId: string }>;

/**
 * Assign a phone number to a 10DLC campaign. Idempotent: Telnyx returns a
 * 4xx error like "+1747... is already assigned to campaign <id>" when the link
 * already exists. We always treat that as success and return the campaign id
 * Telnyx actually has on file, so callers can persist it. This lets onboarding
 * recover after a local DB reset that lost the assignment record, even if the
 * env's master campaign id has drifted from what Telnyx remembers.
 */
export async function telnyxAssignNumberToCampaign(
  env: Env, phoneNumber: string, campaignId: string,
): Promise<AssignCampaignResult> {
  const res = await telnyxCall(env, "/v2/10dlc/phoneNumberCampaign", {
    method: "POST",
    body: { phoneNumber, campaignId },
  });
  if (res.ok) return { ok: true, data: { campaignId } };
  const msg = res.error.message || "";
  if (/already assigned to campaign/i.test(msg)) {
    const match = msg.match(/already assigned to campaign\s+([0-9a-f-]{8,})/i);
    const existing = match?.[1] || campaignId;
    return { ok: true, data: { campaignId: existing } };
  }
  return res;
}

/** Send a single outbound SMS via /v2/messages. Pass `mediaUrls` to send MMS. */
export async function telnyxSendSms(
  env: Env, from: string, to: string, body: string,
  opts: { messagingProfileId?: string; webhookUrl?: string; mediaUrls?: string[] } = {},
): Promise<TelnyxResult<{ id: string; to: Array<{ phone_number: string; status: string }> }>> {
  return telnyxCall(env, "/v2/messages", {
    method: "POST",
    body: {
      from,
      to,
      text: body,
      ...(opts.mediaUrls && opts.mediaUrls.length ? { media_urls: opts.mediaUrls } : {}),
      ...(opts.messagingProfileId ? { messaging_profile_id: opts.messagingProfileId } : {}),
      ...(opts.webhookUrl ? { webhook_url: opts.webhookUrl } : {}),
    },
  });
}
