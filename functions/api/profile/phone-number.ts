/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { normalizeE164 } from "../../_shared/phone.ts";
import { ensureCallingForNumber } from "../../_shared/calling/provision.ts";

/**
 * GET /api/profile/phone-number - caller's currently-saved Telnyx number.
 * POST /api/profile/phone-number - set/update it.
 */
/** Shared phone-number snapshot. Reused by /api/bootstrap/me. */
export async function getPhoneNumberSnapshot(env: Env, userId: number): Promise<{ phone_number: string | null }> {
  const row = await queryFirst<{ telnyx_phone_number: string | null }>(
    env.D1DB, `SELECT telnyx_phone_number FROM "user" WHERE id = ?`, userId,
  );
  return { phone_number: row?.telnyx_phone_number || null };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  return json(await getPhoneNumberSnapshot(env, user.id));
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{ phone?: string }>(request);
  let phone: string;
  try { phone = normalizeE164(body?.phone || ""); } catch (e) { return error((e as Error).message, 400); }
  await execute(env.D1DB, `UPDATE "user" SET telnyx_phone_number = ? WHERE id = ?`, phone, user.id);
  // Keep the calling system in lockstep: ensure phone_numbers +
  // calling_configurations rows reflect this assignment.
  try {
    await ensureCallingForNumber(env, { userId: user.id, phoneNumber: phone });
  } catch (err) {
    console.warn("[profile.phone-number] ensureCallingForNumber failed", err);
  }
  return json({ success: true, phone_number: phone });
};
