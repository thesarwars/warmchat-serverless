/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { getGmailAccessToken, listGmailThreads } from "../../_shared/gmailApi.ts";

/**
 * POST /api/gmail/sync - manually trigger a Gmail thread pull.
 * Heavy reconciliation runs in the cron Worker; this is a quick-checkpoint
 * endpoint so the UI can show fresh threads after the user clicks Sync.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const conn = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM email_connections WHERE user_id = ? AND provider = 'gmail' AND status = 'active' LIMIT 1`,
    user.id,
  );
  if (!conn) return error("Gmail not connected", 404);
  const access = await getGmailAccessToken(env, conn.id);
  if (!access) return error("Gmail access token unavailable", 401);
  const threads = await listGmailThreads(access, 20);
  return json({ success: true, threads_pulled: threads.length });
};
