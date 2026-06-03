/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../../../../_shared/db.ts";
import { requireUser } from "../../../../../_shared/auth.ts";
import { telnyxCall } from "../../../../../_shared/telnyx.ts";

/** POST /api/telnyx/provision/brand/otp/verify - confirm the OTP. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{ otp?: string }>(request);
  const code = (body?.otp || "").trim();
  if (!code) return error("otp is required", 400);

  const u = await queryFirst<{ telnyx_brand_id: string | null }>(
    env.D1DB, `SELECT telnyx_brand_id FROM "user" WHERE id = ?`, user.id,
  );
  if (!u?.telnyx_brand_id) return error("Brand not provisioned", 400);

  const res = await telnyxCall(env, `/v2/10dlc/brand/${u.telnyx_brand_id}/2faEmail/verify`, {
    method: "POST", body: { otp: code },
  });
  if (!res.ok) return error(res.error.message, res.error.status);
  await execute(
    env.D1DB,
    `UPDATE telnyx_sms_activation SET sole_prop_verification_status = 'verified', sole_prop_verified_at = ?, updated_at = ? WHERE user_id = ?`,
    nowIso(), nowIso(), user.id,
  );
  return json({ success: true });
};
