/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { normalizeE164 } from "../../_shared/phone.ts";

/**
 * POST /api/sms/consent - record explicit opt-in consent (from a webform).
 * Body: { phone, source?, ip?, user_agent?, page_url?, consent_text_version? }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{
    phone?: string; source?: string; ip?: string; user_agent?: string;
    page_url?: string; consent_text_version?: string;
  }>(request);
  let phone: string;
  try { phone = normalizeE164(body?.phone || ""); } catch (e) { return error((e as Error).message, 400); }

  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (!m) return error("User not in any organization", 403);

  await execute(
    env.D1DB,
    `INSERT INTO sms_contact
       (org_id, phone_number_e164, opt_in_status, opt_in_source, opt_in_at, opt_in_ip,
        opt_in_user_agent, consent_text_version, consent_page_url)
     VALUES (?, ?, 'subscribed', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(org_id, phone_number_e164) DO UPDATE SET
       opt_in_status = 'subscribed', opt_in_source = excluded.opt_in_source,
       opt_in_at = excluded.opt_in_at, opt_in_ip = excluded.opt_in_ip,
       opt_in_user_agent = excluded.opt_in_user_agent,
       consent_text_version = excluded.consent_text_version,
       consent_page_url = excluded.consent_page_url`,
    m.org_id, phone, body?.source || "manual", nowIso(),
    body?.ip || null, body?.user_agent || null,
    body?.consent_text_version || null, body?.page_url || null,
  );
  return json({ success: true });
};

/**
 * GET /api/sms/consent-proof?phone=... - return the stored consent metadata.
 * Same module to keep the SMS-consent code together.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const phoneRaw = new URL(request.url).searchParams.get("phone");
  if (!phoneRaw) return error("phone required", 400);
  let phone: string;
  try { phone = normalizeE164(phoneRaw); } catch (e) { return error((e as Error).message, 400); }
  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (!m) return error("User not in any organization", 403);
  const row = await queryFirst(
    env.D1DB,
    `SELECT phone_number_e164, opt_in_status, opt_in_source, opt_in_at, opt_in_ip,
            opt_in_user_agent, consent_text_version, consent_page_url
       FROM sms_contact WHERE org_id = ? AND phone_number_e164 = ?`,
    m.org_id, phone,
  );
  if (!row) return error("No consent record found", 404);
  return json(row);
};
