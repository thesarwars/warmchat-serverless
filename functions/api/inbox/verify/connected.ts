/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/** POST /api/inbox/verify/connected -> Gmail connection status flag. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const conn = await queryFirst<{ status: string | null }>(
    env.D1DB,
    `SELECT status FROM email_connections WHERE user_id = ? AND provider = 'gmail' LIMIT 1`,
    user.id,
  );
  if (!conn) return json({ success: false, message: "Not Connected", isVerified: false });
  if (conn.status === "active") return json({ success: true, message: "Connected", isVerified: true });
  return json({ success: false, message: "Reconnect required", isVerified: false });
};
