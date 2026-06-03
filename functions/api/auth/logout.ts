/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, readJson } from "../../_shared/http.ts";
import { execute, nowIso } from "../../_shared/db.ts";
import { verifyRefreshToken } from "../../_shared/jwt.ts";
import { readCookie, clearAuthCookies, REFRESH_COOKIE } from "../../_shared/cookies.ts";

interface Body {
  refresh_token?: string;
}

/**
 * POST /api/auth/logout - revoke the current session and clear auth cookies.
 * Reads the refresh token from the cookie (falls back to body). Idempotent.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  let refreshToken = readCookie(request, REFRESH_COOKIE);
  if (!refreshToken) {
    const body = await readJson<Body>(request);
    refreshToken = body?.refresh_token ?? null;
  }

  if (refreshToken) {
    const claims = await verifyRefreshToken(refreshToken, env.JWT_SECRET);
    if (claims) {
      await execute(
        env.D1DB,
        `UPDATE auth_session SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL`,
        nowIso(),
        claims.session_id,
      );
    }
  }

  const response = json({ message: "Logged out" });
  return clearAuthCookies(response, request);
};
