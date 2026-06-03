/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { randomId } from "../../_shared/auth.ts";
import { mockElasticSendEmail } from "../../_shared/mockSendApi.ts";

/**
 * POST /api/auth/resend-confirmation - re-issue an email-confirmation token.
 * Always 200 to avoid email enumeration.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const body = await readJson<{ email?: string }>(request);
  const email = (body?.email || "").trim().toLowerCase();
  if (!email) return error("email is required", 400);

  const user = await queryFirst<{ id: number; email: string; is_email_confirmed: number }>(
    env.D1DB,
    `SELECT id, email, is_email_confirmed FROM "user" WHERE LOWER(email) = ? LIMIT 1`,
    email,
  );

  if (user && !user.is_email_confirmed) {
    const token = randomId(32);
    const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await execute(
      env.D1DB,
      `UPDATE "user" SET email_confirm_token = ?, email_confirm_expiry = ? WHERE id = ?`,
      token, expiry, user.id,
    );
    const link = `${env.FRONTEND_URL}/api/auth/confirm-email?token=${encodeURIComponent(token)}`;
    // redact: the confirmation token is in the body and must not be logged.
    await mockElasticSendEmail(env, {
      to: user.email,
      subject: "Confirm your WarmChats email",
      isHtml: true,
      body: `<p>Click to confirm your email (valid for 48 hours):</p>
             <p><a href="${link}">${link}</a></p>`,
    }, { redact: true });
  }

  return json({ success: true, message: "If the account exists, a new confirmation link has been sent." });
};
