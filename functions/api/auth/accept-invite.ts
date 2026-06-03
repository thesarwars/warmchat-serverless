/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../_shared/db.ts";
import { hashPassword } from "../../_shared/password.ts";
import { issueSession, buildAuthBody, type UserRow } from "../../_shared/auth.ts";
import { setAuthCookies } from "../../_shared/cookies.ts";
import { verifyTurnstile } from "../../_shared/turnstile.ts";

/**
 * POST /api/auth/accept-invite - finalize an invitation.
 * Body: { token, name, password }. Creates the user + membership row, then
 * issues a session (so the new user lands signed-in).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const body = await readJson<{ token?: string; name?: string; password?: string; turnstileToken?: string }>(request);
  const token = (body?.token || "").trim();
  const name = (body?.name || "").trim();
  const password = body?.password || "";
  if (!token) return error("token is required", 400);

  if (!(await verifyTurnstile(env, body?.turnstileToken, request))) {
    return error("Captcha verification failed. Please try again.", 400);
  }

  const invite = await queryFirst<{
    id: number; email: string; org_id: number; role_id: number; expires_at: string; accepted: number;
  }>(
    env.D1DB,
    `SELECT id, email, org_id, role_id, expires_at, accepted FROM invite WHERE token = ? LIMIT 1`,
    token,
  );
  if (!invite) return error("Invalid invitation token", 400);
  if (invite.accepted) return error("Invitation already used", 400);
  if (new Date(invite.expires_at).getTime() < Date.now()) return error("Invitation expired", 400);

  let user = await queryFirst<UserRow>(
    env.D1DB,
    `SELECT id, name, email, password_hash, is_email_confirmed FROM "user" WHERE LOWER(email) = ?`,
    invite.email.toLowerCase(),
  );

  if (!user) {
    if (password.length < 8) return error("password (min 8 chars) is required for new accounts", 400);
    const hash = await hashPassword(password);
    const ins = await execute(
      env.D1DB,
      `INSERT INTO "user" (name, email, password_hash, is_email_confirmed, email_confirmed, is_invited)
       VALUES (?, ?, ?, 1, 1, 1)`,
      name || null, invite.email, hash,
    );
    user = {
      id: Number(ins.meta.last_row_id), name: name || null, email: invite.email,
      password_hash: hash, is_email_confirmed: 1,
    };
  }

  await execute(
    env.D1DB,
    `INSERT INTO membership (user_id, org_id, role_id) VALUES (?, ?, ?)`,
    user.id, invite.org_id, invite.role_id,
  );
  await execute(env.D1DB, `UPDATE invite SET accepted = 1 WHERE id = ?`, invite.id);

  const session = await issueSession(env, user, request);
  const authBody = await buildAuthBody(env, user, session);
  const res = json(authBody);
  setAuthCookies(res, { accessToken: session.accessToken, refreshToken: session.refreshToken }, request);
  return res;
};

void nowIso;
