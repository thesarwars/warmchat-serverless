/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { encryptSecret } from "../../_shared/crypto.ts";

/**
 * POST /api/inbox/connect - generic IMAP/SMTP connection upsert. Used by the
 * older email-setup flow.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{
    email?: string; provider?: string;
    imap_host?: string; smtp_host?: string;
    port_imap?: number; port_smtp?: number; password?: string;
  }>(request);
  const email = (body?.email || "").trim();
  if (!email) return error("email is required", 400);

  const enc = body?.password ? await encryptSecret(body.password, env.FERNET_KEY) : null;
  const existing = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM inbox_connection WHERE user_id = ? AND email_address = ?`, user.id, email,
  );
  if (existing) {
    await execute(
      env.D1DB,
      `UPDATE inbox_connection
          SET provider = ?, imap_host = ?, smtp_host = ?, encrypted_password = COALESCE(?, encrypted_password),
              port_imap = ?, port_smtp = ?
        WHERE id = ?`,
      body?.provider || "gmail", body?.imap_host || null, body?.smtp_host || null, enc,
      body?.port_imap || 993, body?.port_smtp || 465, existing.id,
    );
    return json({ success: true, id: existing.id });
  }
  const ins = await execute(
    env.D1DB,
    `INSERT INTO inbox_connection
       (user_id, email_address, provider, imap_host, smtp_host, encrypted_password, port_imap, port_smtp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id, email, body?.provider || "gmail", body?.imap_host || null, body?.smtp_host || null, enc,
    body?.port_imap || 993, body?.port_smtp || 465, nowIso(),
  );
  return json({ success: true, id: Number(ins.meta.last_row_id) }, 201);
};
