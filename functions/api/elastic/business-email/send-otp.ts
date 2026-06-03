/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { detectMxStatus } from "../../../_shared/elasticEmail.ts";
import { mockElasticSendEmail } from "../../../_shared/mockSendApi.ts";
import { sha256Hex } from "../../../_shared/crypto.ts";

/**
 * POST /api/elastic/business-email/send-otp - send a 6-digit code to verify
 * the user owns a business email address.
 *
 * MX precheck: if the domain has no email provider, the OTP can't be received
 * (no mailbox to deliver to). Refuse early with a structured error so the UI
 * can redirect the user to Option 3 (WarmChats-as-inbox / DNS TXT verification)
 * instead of silently burning an OTP that'll bounce.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{ email?: string }>(request);
  const email = (body?.email || "").trim().toLowerCase();
  if (!email) return error("email is required", 400);

  const domain = email.split("@")[1] || "";

  // Short-circuit: if this user already has an Elastic connection on this
  // domain (or a verified business_email_verification row), don't burn
  // another OTP. Hand the client back the existing connection state so the
  // UI can either jump straight to DNS records (otp_verified / registered)
  // or recognize the domain as already fully connected (verified).
  const existingConn = domain
    ? await queryFirst<{ status: string | null; email_address: string }>(
        env.D1DB,
        `SELECT status, email_address FROM inbox_connection
           WHERE user_id = ? AND provider = 'elastic'
             AND (email_address LIKE '%@' || ? OR elastic_from_email LIKE '%@' || ?)
           ORDER BY id DESC LIMIT 1`,
        user.id, domain, domain,
      )
    : null;
  if (existingConn) {
    return json({
      success: true,
      already_connected: true,
      status: existingConn.status || "verified",
      email: existingConn.email_address,
      message: `${existingConn.email_address} is already connected via Elastic. Skipped OTP.`,
    });
  }
  const existingOtp = domain
    ? await queryFirst<{ verified_at: string | null; email: string }>(
        env.D1DB,
        `SELECT verified_at, email FROM business_email_verification
           WHERE user_id = ? AND email = ? AND verified_at IS NOT NULL
           ORDER BY id DESC LIMIT 1`,
        user.id, email,
      )
    : null;
  if (existingOtp) {
    return json({
      success: true,
      already_verified: true,
      status: "otp_verified",
      email: existingOtp.email,
      message: `${existingOtp.email} was already verified via OTP. Skipped resend.`,
    });
  }

  if (domain) {
    const mx = await detectMxStatus(domain);
    // "none" = no provider, "elastic" = MX already points at us. Either way
    // the OTP-to-mailbox approach won't work (no inbox to deliver to / we'd
    // be sending a mail destined for our own inbound webhook). Redirect to
    // Option 3 (DNS-TXT takeover) which doesn't need a working mailbox.
    if (mx.status === "none" || mx.status === "elastic") {
      return json({
        success: false,
        no_email_provider: true,
        mx_status: mx.status,
        domain,
        message: mx.status === "elastic"
          ? `${domain}'s MX already points to WarmChats / Elastic, so an OTP can't be delivered to your own mailbox. Use Option 3 (WarmChats as your inbox) - the TXT verification handles ownership without needing a working external inbox.`
          : `${domain} has no MX records, so we can't deliver an OTP to ${email}. Use Option 3 (Use WarmChats as your inbox) to verify ownership via DNS TXT instead.`,
      }, 409);
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const existing = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM business_email_verification WHERE user_id = ? AND email = ?`,
    user.id, email,
  );
  if (existing) {
    await execute(
      env.D1DB,
      `UPDATE business_email_verification
          SET code_hash = ?, expires_at = ?, verified_at = NULL, attempts = 0, updated_at = ?
        WHERE id = ?`,
      codeHash, expiresAt, nowIso(), existing.id,
    );
  } else {
    await execute(
      env.D1DB,
      `INSERT INTO business_email_verification (user_id, email, code_hash, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      user.id, email, codeHash, expiresAt, nowIso(), nowIso(),
    );
  }

  // redact: OTP code is in the body and must never be persisted to mock logs.
  const res = await mockElasticSendEmail(env, {
    to: email,
    subject: "Your WarmChats verification code",
    isHtml: true,
    body: `<p>Your verification code is <b>${code}</b>. It expires in 10 minutes.</p>`,
  }, { redact: true });
  if (!res.ok) return error(res.error || "Failed to send verification email", 502);
  return json({ success: true });
};
