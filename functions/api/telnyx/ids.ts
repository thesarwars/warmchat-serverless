/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { normalizeE164 } from "../../_shared/phone.ts";

const ALLOWED_STATUSES = new Set([
  "inactive", "pending", "registered", "rejected", "submitted",
  "approved", "suspended", "failed", "error",
]);

/**
 * POST /api/telnyx/ids - patch the Telnyx-related fields on the user row.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const data = (await readJson<Record<string, unknown>>(request)) || {};
  const fields: string[] = [];
  const values: unknown[] = [];

  const tryAdd = (key: string, value: unknown): void => {
    fields.push(`${key} = ?`); values.push(value);
  };

  if ("telnyx_messaging_profile_id" in data) tryAdd("telnyx_messaging_profile_id", String(data.telnyx_messaging_profile_id || "").trim() || null);
  if ("telnyx_brand_id" in data) tryAdd("telnyx_brand_id", String(data.telnyx_brand_id || "").trim() || null);
  if ("telnyx_campaign_id" in data) tryAdd("telnyx_campaign_id", String(data.telnyx_campaign_id || "").trim() || null);
  if ("telnyx_phone_number" in data) {
    const raw = String(data.telnyx_phone_number || "").trim();
    if (raw) {
      try { tryAdd("telnyx_phone_number", normalizeE164(raw)); }
      catch (e) { return error((e as Error).message, 400); }
    } else tryAdd("telnyx_phone_number", null);
  }
  if ("telnyx_sms_status" in data) {
    const status = String(data.telnyx_sms_status || "").trim().toLowerCase() || null;
    if (status && !ALLOWED_STATUSES.has(status)) {
      return error(`telnyx_sms_status must be one of ${[...ALLOWED_STATUSES].join(", ")}`, 400);
    }
    tryAdd("telnyx_sms_status", status);
  }
  if ("telnyx_error_reason" in data) tryAdd("telnyx_error_reason", String(data.telnyx_error_reason || "").trim() || null);
  if ("telnyx_campaign_number_status" in data) tryAdd("telnyx_campaign_number_status", String(data.telnyx_campaign_number_status || "").trim() || null);

  if (fields.length === 0) return error("No editable fields supplied", 400);
  values.push(user.id);
  await execute(env.D1DB, `UPDATE "user" SET ${fields.join(", ")} WHERE id = ?`, ...values);

  const u = await queryFirst(
    env.D1DB,
    `SELECT id, telnyx_messaging_profile_id, telnyx_phone_number, telnyx_brand_id,
            telnyx_campaign_id, telnyx_sms_status, telnyx_error_reason,
            telnyx_campaign_number_status
       FROM "user" WHERE id = ?`,
    user.id,
  );
  return json({ user: u });
};

void nowIso;
