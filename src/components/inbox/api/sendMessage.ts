import type { SendEmailArgs, SendSmsArgs } from "../types";
import { QuietHoursError } from "../types";

export type QuietHoursPayload = {
  code?: string;
  hour?: number;
  timezone?: string;
  until?: string;
  error?: string;
  message?: string;
};

/**
 * Return a structured QuietHoursError when the server signals quiet-hours via
 * `code: "QUIET_HOURS"` in the body, otherwise `null`. The server returns HTTP
 * 200 here so Cloudflare doesn't log a false error - detection keys off the
 * body code, not the status. Use from raw-fetch send paths that want to prompt
 * the user instead of throwing.
 */
export function detectQuietHours(
  _res: Response,
  data: QuietHoursPayload,
): QuietHoursError | null {
  if (data?.code !== "QUIET_HOURS") return null;
  return new QuietHoursError({
    hour: Number(data.hour ?? 0),
    timezone: String(data.timezone ?? ""),
    until: String(data.until ?? ""),
    message: data.error || data.message,
  });
}

/**
 * Throw a structured QuietHoursError when the server signals quiet-hours via
 * `code: "QUIET_HOURS"`. Composer/modal handlers catch it, prompt the user,
 * and retry the request with `confirmQuietHours: true`.
 */
function maybeThrowQuietHours(res: Response, data: QuietHoursPayload): void {
  const err = detectQuietHours(res, data);
  if (err) throw err;
}

export async function sendInboxEmail({
  apiBase,
  token,
  userId,
  orgId,
  senderName,
  to,
  subject,
  body,
  leadId,
  threadId,
  senderType,
  attachments,
  confirmQuietHours,
}: SendEmailArgs) {
  const payload = {
    user_id: userId,
    to,
    subject,
    body,
    org_id: orgId,
    thread_id: threadId || null,
    lead_ids: [leadId],
    sender_type: senderType,
    sender_name: senderName,
    attachments,
    confirm_quiet_hours: confirmQuietHours ? true : undefined,
  };
  console.log("[sendInboxEmail] → POST /inbox/send/reply", payload);

  const res = await fetch(`${apiBase}/inbox/send/reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  console.log(`[sendInboxEmail] ← HTTP ${res.status}`, data);
  maybeThrowQuietHours(res, data as QuietHoursPayload);
  return { res, data };
}

export async function sendInboxSms({
  smsApiBase,
  token,
  to,
  body,
  leadId,
  attachments,
  confirmQuietHours,
}: SendSmsArgs) {
  const res = await fetch(`${smsApiBase}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      body,
      lead_id: leadId,
      attachments,
      client_request_id: crypto.randomUUID(),
      confirm_quiet_hours: confirmQuietHours ? true : undefined,
    }),
  });

  const data = await res.json().catch(() => ({}));
  maybeThrowQuietHours(res, data as QuietHoursPayload);
  return { res, data };
}
