/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { encryptSecret } from "../../../_shared/crypto.ts";

/**
 * POST /api/elastic/business-email/imap-setup - save IMAP creds for inbound
 * polling. Password is encrypted with FERNET_KEY before storage.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{
    email?: string; imap_host?: string; smtp_host?: string;
    port_imap?: number; port_smtp?: number; password?: string;
    elastic_from_email?: string;
  }>(request);
  const email = (body?.email || "").trim();
  const password = body?.password || "";
  if (!email || !password) return error("email and password are required", 400);

  const enc = await encryptSecret(password, env.FERNET_KEY);
  const existing = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM inbox_connection WHERE user_id = ? AND email_address = ?`, user.id, email,
  );
  if (existing) {
    await execute(
      env.D1DB,
      `UPDATE inbox_connection
          SET imap_host = ?, smtp_host = ?, encrypted_password = ?,
              port_imap = ?, port_smtp = ?, elastic_from_email = ?, provider = 'elastic'
        WHERE id = ?`,
      body?.imap_host || null, body?.smtp_host || null, enc,
      body?.port_imap || 993, body?.port_smtp || 465, body?.elastic_from_email || email, existing.id,
    );
    return json({ success: true, id: existing.id });
  }
  const ins = await execute(
    env.D1DB,
    `INSERT INTO inbox_connection
       (user_id, email_address, imap_host, smtp_host, encrypted_password,
        port_imap, port_smtp, elastic_from_email, provider, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'elastic', ?)`,
    user.id, email, body?.imap_host || null, body?.smtp_host || null, enc,
    body?.port_imap || 993, body?.port_smtp || 465, body?.elastic_from_email || email, nowIso(),
  );
  return json({ success: true, id: Number(ins.meta.last_row_id) }, 201);
};
