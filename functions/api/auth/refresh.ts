/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../_shared/db.ts";
import { verifyRefreshToken, signAccessToken, signRefreshToken, tokenTtl, refreshTtl } from "../../_shared/jwt.ts";
import { randomId } from "../../_shared/auth.ts";
import { readCookie, setAuthCookies, REFRESH_COOKIE } from "../../_shared/cookies.ts";

interface Body {
  refresh_token?: string;
}

/**
 * POST /api/auth/refresh - rotate tokens.
 * Reads the refresh token from the HttpOnly cookie (falls back to body or
 * Authorization header for older callers), verifies the auth_session is live,
 * rotates the jti, and sets fresh token cookies. Returns new expiries (no tokens).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  let refreshToken = readCookie(request, REFRESH_COOKIE);
  if (!refreshToken) {
    const body = await readJson<Body>(request);
    refreshToken = body?.refresh_token ?? null;
  }
  if (!refreshToken) {
    const header = request.headers.get("Authorization") ?? "";
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) refreshToken = m[1]!;
  }
  if (!refreshToken) return error("Missing refresh token", 400);

  const claims = await verifyRefreshToken(refreshToken, env.JWT_SECRET);
  if (!claims) return error("Invalid refresh token", 401);

  const session = await queryFirst<{
    id: number;
    refresh_token_jti: string;
    revoked_at: string | null;
    expires_at: string;
  }>(
    env.D1DB,
    `SELECT id, refresh_token_jti, revoked_at, expires_at
       FROM auth_session WHERE session_id = ? AND user_id = ?`,
    claims.session_id,
    Number(claims.sub),
  );

  if (
    !session ||
    session.revoked_at !== null ||
    session.refresh_token_jti !== claims.jti ||
    new Date(session.expires_at).getTime() < Date.now()
  ) {
    return error("Session is no longer valid", 401);
  }

  // Keep the original "keep me logged in" choice and slide the session window
  // forward so an actively-used session never expires out from under the user.
  const remember = claims.remember;
  const refreshTtlSeconds = refreshTtl(remember);
  const now = Date.now();
  const newExpiresAt = new Date(now + refreshTtlSeconds * 1000).toISOString();

  // Rotate the jti so the old refresh token can't be replayed.
  const newJti = randomId(32);
  await execute(
    env.D1DB,
    `UPDATE auth_session SET refresh_token_jti = ?, last_used_at = ?, expires_at = ? WHERE id = ?`,
    newJti,
    nowIso(),
    newExpiresAt,
    session.id,
  );

  const userId = Number(claims.sub);
  const [accessToken, newRefreshToken] = await Promise.all([
    signAccessToken(userId, env.JWT_SECRET),
    signRefreshToken(userId, claims.session_id, newJti, env.JWT_SECRET, remember),
  ]);

  const response = json({
    access_token_expires_at: new Date(now + tokenTtl.access * 1000).toISOString(),
    refresh_token_expires_at: newExpiresAt,
    session_expires_at: newExpiresAt,
    message: "Refreshed",
  });
  return setAuthCookies(response, { accessToken, refreshToken: newRefreshToken }, request, refreshTtlSeconds);
};
