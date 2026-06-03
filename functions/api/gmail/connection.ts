/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET /api/gmail/connection - the user's current Gmail OAuth state.
 * Real OAuth + watch refresh lives in Phase 4; today we just report what's
 * persisted in the email_connections table.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const row = await queryFirst<{ status: string | null; email_address: string | null }>(
    env.D1DB,
    `SELECT status, email_address FROM email_connections
      WHERE user_id = ? AND provider = 'gmail' ORDER BY id DESC LIMIT 1`,
    user.id,
  );
  // Frontend consumers (Onboarding, ConnectAccount, MainLayout) read
  // `email_address` - keep the key in sync or the connected email silently
  // drops and a stale address shows instead.
  if (!row) return json({ status: "not_connected", email_address: null });
  return json({ status: row.status || "not_connected", email_address: row.email_address });
};
