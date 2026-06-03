/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { error } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";

/**
 * GET /api/auth/confirm-email?token=... - flip the user's confirmation flag.
 * Redirects to FRONTEND_URL on success so the link is clickable from email.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return error("token is required", 400);

  const user = await queryFirst<{ id: number; email_confirm_expiry: string | null }>(
    env.D1DB,
    `SELECT id, email_confirm_expiry FROM "user" WHERE email_confirm_token = ? LIMIT 1`,
    token,
  );
  if (!user) return Response.redirect(`${env.FRONTEND_URL}/confirm-email?status=invalid`, 302);
  if (!user.email_confirm_expiry || new Date(user.email_confirm_expiry).getTime() < Date.now()) {
    return Response.redirect(`${env.FRONTEND_URL}/confirm-email?status=expired`, 302);
  }

  await execute(
    env.D1DB,
    `UPDATE "user"
        SET is_email_confirmed = 1, email_confirmed = 1,
            email_confirm_token = NULL, email_confirm_expiry = NULL
      WHERE id = ?`,
    user.id,
  );
  return Response.redirect(`${env.FRONTEND_URL}/confirm-email?status=ok`, 302);
};
