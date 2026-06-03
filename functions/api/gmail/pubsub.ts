/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json } from "../../_shared/http.ts";
import { execute, nowIso } from "../../_shared/db.ts";

/**
 * POST /api/gmail/pubsub - Google Pub/Sub push delivery when a watched Gmail
 * inbox has new history. Decode the base64 payload, record the latest
 * historyId for the connection. Heavy sync runs in the cron Worker.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  let body: { message?: { data?: string } };
  try { body = await request.json(); } catch { return json({ ok: true, ignored: "bad json" }); }
  const dataB64 = body.message?.data;
  if (!dataB64) return json({ ok: true, ignored: "no message.data" });

  try {
    const decoded = JSON.parse(atob(dataB64)) as { emailAddress?: string; historyId?: string };
    if (!decoded.emailAddress || !decoded.historyId) return json({ ok: true, ignored: "no email/history" });
    await execute(
      env.D1DB,
      `UPDATE gmail_watch_state
          SET history_id_checkpoint = ?, last_watch_renew_at = ?, updated_at = ?
        WHERE connection_id IN (SELECT id FROM email_connections WHERE email_address = ?)`,
      decoded.historyId, nowIso(), nowIso(), decoded.emailAddress,
    );
    return json({ ok: true });
  } catch {
    return json({ ok: true, ignored: "decode failed" });
  }
};
