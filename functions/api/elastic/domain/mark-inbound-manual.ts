/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * POST /api/elastic/domain/mark-inbound-manual - flag an inbox_connection as
 * "manually configured" (the user added the inbound route through ElasticEmail
 * UI directly).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{ email?: string }>(request);
  const email = (body?.email || "").trim();
  if (!email) return error("email is required", 400);
  await execute(
    env.D1DB,
    `UPDATE inbox_connection SET elastic_email_inbound_route_added = 1 WHERE user_id = ? AND email_address = ?`,
    user.id, email,
  );
  return json({ success: true });
};
