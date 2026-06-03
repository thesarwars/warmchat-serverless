/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/** GET /api/telnyx/status - narrow status reporter used by ConnectPhoneNumber. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const u = await queryFirst<{ telnyx_sms_status: string | null; telnyx_phone_number: string | null }>(
    env.D1DB, `SELECT telnyx_sms_status, telnyx_phone_number FROM "user" WHERE id = ?`, user.id);
  return json({
    status: u?.telnyx_sms_status ?? "not_started",
    phone_number: u?.telnyx_phone_number ?? null,
  });
};
