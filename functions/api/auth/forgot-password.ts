/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../_shared/db.ts";
import { randomId } from "../../_shared/auth.ts";
import { mockElasticSendEmail } from "../../_shared/mockSendApi.ts";
import { verifyTurnstile } from "../../_shared/turnstile.ts";

/**
 * POST /api/auth/forgot-password - generate a reset token, email a link.
 * Always returns 200 to avoid disclosing which emails exist.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const body = await readJson<{ email?: string; turnstileToken?: string }>(request);
  const email = (body?.email || "").trim().toLowerCase();
  if (!email) return error("email is required", 400);

  if (!(await verifyTurnstile(env, body?.turnstileToken, request))) {
    return error("Captcha verification failed. Please try again.", 400);
  }

  const user = await queryFirst<{ id: number; email: string }>(
    env.D1DB, `SELECT id, email FROM "user" WHERE LOWER(email) = ? LIMIT 1`, email,
  );

  if (user) {
    const token = randomId(32);
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
    await execute(
      env.D1DB,
      `UPDATE "user" SET reset_password_token = ?, reset_token_expiry = ? WHERE id = ?`,
      token, expiry, user.id,
    );
    const link = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
    // redact=true so the reset-link / token never lands in mock_send_log.
    await mockElasticSendEmail(env, {
      to: user.email,
      subject: "Reset your WarmChats password",
      isHtml: true,
      body: `<p>Click the link below to reset your password (valid for 1 hour):</p>
             <p><a href="${link}">${link}</a></p>
             <p>If you didn't request this, ignore this email.</p>`,
    }, { redact: true });
  }

  return json({ success: true, message: "If that email exists, a reset link has been sent." });
};

// Avoid unused import warning if nowIso isn't used:
void nowIso;
