/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { mockTelnyxSendSms } from "../../_shared/mockSendApi.ts";
import { normalizeE164 } from "../../_shared/phone.ts";

/**
 * POST /api/sms/opt-in-request - send a one-tap opt-in invitation SMS to a
 * contact.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{ phone?: string; lead_id?: number }>(request);
  let phone: string;
  try {
    phone = normalizeE164(body?.phone || "");
  } catch (e) { return error((e as Error).message, 400); }

  const u = await queryFirst<{ telnyx_phone_number: string | null }>(
    env.D1DB, `SELECT telnyx_phone_number FROM "user" WHERE id = ?`, user.id,
  );
  if (!u?.telnyx_phone_number) return error("Telnyx number not provisioned", 400);

  const msg = `Reply START to confirm you'd like to receive messages from ${user.name || "your WarmChats agent"}. Reply STOP at any time to opt out.`;
  // Opt-in invitation - body is template, not OTP. Allow it through to the
  // mock log unredacted so the admin debug page can see the wording.
  const res = await mockTelnyxSendSms(env, u.telnyx_phone_number, phone, msg, {
    leadId: body?.lead_id ?? null,
  });
  if (!res.ok) return error(res.error.message, res.error.status);

  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (m) {
    await execute(
      env.D1DB,
      `INSERT INTO sms_contact (org_id, phone_number_e164, opt_in_message_sent, opt_in_source, opt_in_at)
         VALUES (?, ?, 1, 'opt-in-request', ?)
       ON CONFLICT(org_id, phone_number_e164) DO UPDATE
         SET opt_in_message_sent = 1, opt_in_source = 'opt-in-request', opt_in_at = excluded.opt_in_at`,
      m.org_id, phone, nowIso(),
    );
  }
  return json({ success: true });
};
