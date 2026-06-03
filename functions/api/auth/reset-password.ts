/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { hashPassword } from "../../_shared/password.ts";
import { verifyTurnstile } from "../../_shared/turnstile.ts";

/**
 * POST /api/auth/reset-password - verify reset token, set new password.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const body = await readJson<{ token?: string; password?: string; turnstileToken?: string }>(request);
  const token = (body?.token || "").trim();
  const password = body?.password || "";
  if (!token || password.length < 8) {
    return error("token and password (min 8 chars) are required", 400);
  }

  if (!(await verifyTurnstile(env, body?.turnstileToken, request))) {
    return error("Captcha verification failed. Please try again.", 400);
  }

  const user = await queryFirst<{ id: number; reset_token_expiry: string | null }>(
    env.D1DB,
    `SELECT id, reset_token_expiry FROM "user" WHERE reset_password_token = ? LIMIT 1`,
    token,
  );
  if (!user) return error("Invalid or expired reset token", 400);
  if (!user.reset_token_expiry || new Date(user.reset_token_expiry).getTime() < Date.now()) {
    return error("Reset token has expired", 400);
  }

  const hash = await hashPassword(password);
  await execute(
    env.D1DB,
    `UPDATE "user" SET password_hash = ?, reset_password_token = NULL, reset_token_expiry = NULL WHERE id = ?`,
    hash, user.id,
  );
  return json({ success: true });
};
