/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryFirst } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { telnyxCall } from "../../../../_shared/telnyx.ts";

/** POST /api/telnyx/provision/brand/otp - request the brand-verification OTP (sole-prop only). */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const u = await queryFirst<{ telnyx_brand_id: string | null }>(
    env.D1DB, `SELECT telnyx_brand_id FROM "user" WHERE id = ?`, user.id,
  );
  if (!u?.telnyx_brand_id) return error("Brand not provisioned", 400);

  const res = await telnyxCall(env, `/v2/10dlc/brand/${u.telnyx_brand_id}/2faEmail`, { method: "POST" });
  if (!res.ok) return error(res.error.message, res.error.status);
  return json({ success: true });
};
