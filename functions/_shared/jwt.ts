import { SignJWT, jwtVerify } from "jose";

/**
 * HS256 access + refresh tokens:
 * the refresh token carries `session_id` + `jti` which map to the auth_session
 * row (session_id, refresh_token_jti) so a logout can revoke it.
 */

const ACCESS_TTL_SECONDS = 60 * 60; // 1h
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7d default session
const REFRESH_TTL_REMEMBER_SECONDS = 30 * 24 * 60 * 60; // 30d when "keep me logged in" is checked

/** Refresh-token lifetime in seconds, longer when the user opted to stay logged in. */
export function refreshTtl(remember: boolean): number {
  return remember ? REFRESH_TTL_REMEMBER_SECONDS : REFRESH_TTL_SECONDS;
}

export interface AccessClaims {
  sub: string; // user id
  type: "access";
}

export interface RefreshClaims {
  sub: string; // user id
  type: "refresh";
  session_id: string;
  jti: string;
  remember: boolean;
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(userId: number, secret: string): Promise<string> {
  return new SignJWT({ type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(key(secret));
}

export async function signRefreshToken(
  userId: number,
  sessionId: string,
  jti: string,
  secret: string,
  remember = false,
): Promise<string> {
  return new SignJWT({ type: "refresh", session_id: sessionId, jti, remember })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${refreshTtl(remember)}s`)
    .sign(key(secret));
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret));
    if (payload.type !== "access" || !payload.sub) return null;
    return { sub: payload.sub, type: "access" };
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string, secret: string): Promise<RefreshClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret));
    if (payload.type !== "refresh" || !payload.sub || !payload["session_id"] || !payload["jti"]) {
      return null;
    }
    return {
      sub: payload.sub,
      type: "refresh",
      session_id: payload["session_id"] as string,
      jti: payload["jti"] as string,
      remember: Boolean(payload["remember"]),
    };
  } catch {
    return null;
  }
}

export const tokenTtl = { access: ACCESS_TTL_SECONDS, refresh: REFRESH_TTL_SECONDS };
