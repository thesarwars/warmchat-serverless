/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

const FIELDS = [
  "notify_sms_inbound",
  "notify_email_inbound",
  "notify_calls",
  "notify_appointments",
  "notify_billing",
  "notify_system",
  "notify_ai_reply",
  "notify_via_web_push",
  "notify_via_mobile_push",
  "notify_via_email_digest",
  "notify_in_app_toast",
  "notify_sound",
] as const;
type Field = (typeof FIELDS)[number];

/** Read the notify_* booleans for one user. Shared with /api/bootstrap/me. */
export async function getNotificationSettings(env: Env, userId: number): Promise<Record<string, boolean>> {
  const row = await queryFirst<Record<Field, number>>(
    env.D1DB, `SELECT ${FIELDS.join(", ")} FROM "user" WHERE id = ?`, userId);
  const out: Record<string, boolean> = {};
  for (const f of FIELDS) out[f] = Boolean(row?.[f]);
  return out;
}

/** GET /api/me/notification-settings -> the 5 notify_* booleans. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  return json(await getNotificationSettings(env, user.id));
};

/** PATCH /api/me/notification-settings - update any subset of the 5 booleans. */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<Record<string, unknown>>(request)) || {};
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (!FIELDS.includes(k as Field)) return error(`Unknown field: ${k}`, 400);
    if (typeof v !== "boolean") return error(`Field ${k} must be a boolean`, 400);
    updates.push(`${k} = ?`);
    values.push(v ? 1 : 0);
  }
  if (updates.length) {
    await execute(env.D1DB, `UPDATE "user" SET ${updates.join(", ")} WHERE id = ?`, ...values, user.id);
  }
  return json(await getNotificationSettings(env, user.id));
};
