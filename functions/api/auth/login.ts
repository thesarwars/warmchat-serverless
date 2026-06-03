/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { verifyPassword } from "../../_shared/password.ts";
import { issueSession, buildAuthBody, type UserRow } from "../../_shared/auth.ts";
import { setAuthCookies } from "../../_shared/cookies.ts";
import { verifyTurnstile } from "../../_shared/turnstile.ts";

interface Body {
  email?: string;
  password?: string;
  remember?: boolean;
  turnstileToken?: string;
}

/**
 * POST /api/auth/login - password login.
 * Verifies credentials, opens an auth_session, sets HttpOnly token cookies and
 * returns the flat profile body (no tokens) the SPA stores for its UI.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const body = await readJson<Body>(request);

  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !password) return error("Missing email or password", 400);

  if (!(await verifyTurnstile(env, body?.turnstileToken, request))) {
    return error("Captcha verification failed. Please try again.", 400);
  }

  const user = await queryFirst<UserRow>(
    env.D1DB,
    `SELECT id, name, email, password_hash, is_email_confirmed FROM "user" WHERE email = ?`,
    email,
  );
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return error("Invalid email or password", 401);
  }

  const session = await issueSession(env, user, request, Boolean(body?.remember));
  const authBody = await buildAuthBody(env, user, session);
  const response = json({ ...authBody, message: "Logged in" }, 200);
  return setAuthCookies(response, session, request, session.refreshTtlSeconds);
};
