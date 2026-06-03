/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../_shared/db.ts";
import { issueSession, buildAuthBody, type UserRow } from "../../_shared/auth.ts";
import { setAuthCookies } from "../../_shared/cookies.ts";

/**
 * POST /api/auth/google-login - verify a Google ID token and issue a session.
 * The frontend sends the credential from
 * Google Sign-In; we verify via Google's `tokeninfo` endpoint (no SDK needed)
 * and then upsert the user.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const body = await readJson<{ credential?: string; token?: string; id_token?: string; remember?: boolean }>(request);
  const idToken = body?.credential || body?.token || body?.id_token;
  if (!idToken) return error("Google credential is required", 400);

  const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!verifyRes.ok) return error("Invalid Google credential", 401);
  const claims = await verifyRes.json() as {
    aud: string; email: string; email_verified?: string | boolean; name?: string; sub?: string;
  };
  if (claims.aud !== env.GOOGLE_CLIENT_ID) return error("Token audience mismatch", 401);
  const emailVerified = String(claims.email_verified || "false").toLowerCase() === "true";
  if (!emailVerified) return error("Google email is not verified", 401);

  const email = claims.email.toLowerCase();
  let user = await queryFirst<UserRow>(
    env.D1DB, `SELECT id, name, email, password_hash, is_email_confirmed FROM "user" WHERE LOWER(email) = ? LIMIT 1`, email,
  );
  const isNewUser = !user;
  if (!user) {
    const ins = await execute(
      env.D1DB,
      `INSERT INTO "user" (name, email, is_email_confirmed, email_confirmed, is_google_user)
       VALUES (?, ?, 1, 1, 1)`,
      claims.name || null, email,
    );
    const newUserId = Number(ins.meta.last_row_id);

    const orgInsert = await execute(
      env.D1DB,
      `INSERT INTO organization (name, owner_id) VALUES (?, ?)`,
      `${claims.name || email}'s Workspace`,
      newUserId,
    );
    const orgId = Number(orgInsert.meta.last_row_id);
    await execute(env.D1DB, `INSERT OR IGNORE INTO role (name) VALUES ('Owner')`);
    const ownerRole = await queryFirst<{ id: number }>(
      env.D1DB, `SELECT id FROM role WHERE name = 'Owner'`,
    );
    await execute(
      env.D1DB,
      `INSERT INTO membership (user_id, org_id, role_id) VALUES (?, ?, ?)`,
      newUserId, orgId, ownerRole!.id,
    );

    // Seed onboarding_progress so the post-auth GET /api/onboarding/:userId
    // returns step=1 and the UI routes to /onboarding instead of /dashboard.
    await execute(
      env.D1DB,
      `INSERT INTO onboarding_progress (user_id) VALUES (?)`,
      newUserId,
    );

    user = {
      id: newUserId,
      name: claims.name || null,
      email,
      password_hash: null,
      is_email_confirmed: 1,
    };
  }

  const session = await issueSession(env, user, request, Boolean(body?.remember));
  const body2 = await buildAuthBody(env, user, session);
  const res = json({ ...body2, is_new_user: isNewUser });
  setAuthCookies(
    res,
    { accessToken: session.accessToken, refreshToken: session.refreshToken },
    request,
    session.refreshTtlSeconds,
  );
  return res;
};

void nowIso;
