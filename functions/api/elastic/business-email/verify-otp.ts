/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { sha256Hex, timingSafeEqual } from "../../../_shared/crypto.ts";
import { mockElasticSendEmail } from "../../../_shared/mockSendApi.ts";

const MAX_ATTEMPTS = 5;

/** POST /api/elastic/business-email/verify-otp - match code, mark verified.
 * On success it also upserts the Elastic inbox connection and sends the
 * welcome email. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  // Frontend (ConnectDomain.tsx) sends `otp`; accept `code` too for parity.
  const body = await readJson<{ email?: string; code?: string; otp?: string }>(request);
  const email = (body?.email || "").trim().toLowerCase();
  const code = (body?.code || body?.otp || "").trim();
  if (!email || !code) return error("email and code are required", 400);

  const row = await queryFirst<{
    id: number; code_hash: string; expires_at: string; verified_at: string | null; attempts: number;
  }>(
    env.D1DB,
    `SELECT id, code_hash, expires_at, verified_at, attempts
       FROM business_email_verification
      WHERE user_id = ? AND email = ?`,
    user.id, email,
  );
  if (!row) return error("No pending verification for that email", 404);
  if (row.verified_at) return json({ success: true, already_verified: true });
  if (row.attempts >= MAX_ATTEMPTS) return error("Too many attempts. Request a new code.", 429);
  if (new Date(row.expires_at).getTime() < Date.now()) return error("Code expired", 400);

  const codeHash = await sha256Hex(code);
  if (!timingSafeEqual(codeHash, row.code_hash)) {
    await execute(
      env.D1DB,
      `UPDATE business_email_verification SET attempts = attempts + 1, updated_at = ? WHERE id = ?`,
      nowIso(), row.id,
    );
    return error("Invalid code", 400);
  }

  await execute(
    env.D1DB,
    `UPDATE business_email_verification SET verified_at = ?, updated_at = ? WHERE id = ?`,
    nowIso(), nowIso(), row.id,
  );

  // Upsert the Elastic inbox connection (status otp_verified, not yet sending-
  // verified).
  const existingConn = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM inbox_connection WHERE user_id = ? AND email_address = ? AND provider = 'elastic'`,
    user.id, email,
  );
  if (existingConn) {
    await execute(
      env.D1DB,
      `UPDATE inbox_connection
          SET status = 'otp_verified', elastic_from_email = ?, is_verified = 0
        WHERE id = ?`,
      email, existingConn.id,
    );
  } else {
    await execute(
      env.D1DB,
      `INSERT INTO inbox_connection
         (user_id, email_address, provider, elastic_from_email, smtp_host, port_smtp,
          can_receive, is_verified, status)
       VALUES (?, ?, 'elastic', ?, 'smtp.elasticemail.com', 2525, 1, 0, 'otp_verified')`,
      user.id, email, email,
    );
  }

  // Send the welcome email to the verified business address.
  await mockElasticSendEmail(env, {
    to: email,
    subject: "Welcome to WarmChats",
    isHtml: true,
    body:
      `<div style="font-family:Arial, sans-serif; line-height:1.6;">` +
      `<p>Hi there,</p>` +
      `<p>Your business email <strong>${email}</strong> is confirmed.</p>` +
      `<p>Next, add the DNS records in WarmChats so sending unlocks as soon as ` +
      `Elastic verifies the required sending checks.</p>` +
      `<p>- The WarmChats Team</p></div>`,
  });

  return json({ success: true });
};
