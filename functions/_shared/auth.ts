/// <reference types="@cloudflare/workers-types" />
import { queryFirst, execute, nowIso } from "./db.ts";
import { signAccessToken, signRefreshToken, verifyAccessToken, tokenTtl, refreshTtl } from "./jwt.ts";
import { readCookie, ACCESS_COOKIE } from "./cookies.ts";
import { resolveSiteAdmin } from "./adminAccess.ts";
import type { Env } from "./env.ts";

export interface UserRow {
  id: number;
  name: string | null;
  email: string;
  password_hash: string | null;
  is_email_confirmed: number;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  refreshTtlSeconds: number;
}

/**
 * Flat auth payload returned in the response body (NO tokens - those are set as
 * HttpOnly cookies). Matches the shape src/utils/authSession.ts expects so the
 * SPA can populate role/org for its UI and route guards.
 */
export interface AuthBody {
  user_id: number;
  name: string | null;
  email: string;
  is_email_confirmed: boolean;
  is_admin: boolean;
  org_id: number | null;
  org_name: string | null;
  role_id: number | null;
  role_name: string | null;
  plan: string | null;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  session_expires_at: string;
}

/** Generate a URL-safe random id (used for session_id and refresh jti). */
export function randomId(bytes = 24): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  let s = "";
  for (const b of arr) s += b.toString(16).padStart(2, "0");
  return s;
}

/**
 * Create an auth_session row and mint access + refresh tokens for `user`.
 * Tokens are returned to the caller, which is responsible for setting them as
 * HttpOnly cookies.
 */
export async function issueSession(
  env: Env,
  user: UserRow,
  request: Request,
  remember = false,
): Promise<IssuedSession> {
  const sessionId = randomId(32);
  const jti = randomId(32);
  const now = Date.now();
  const refreshTtlSeconds = refreshTtl(remember);
  const refreshExpiresAt = new Date(now + refreshTtlSeconds * 1000).toISOString();
  const accessExpiresAt = new Date(now + tokenTtl.access * 1000).toISOString();

  await execute(
    env.D1DB,
    `INSERT INTO auth_session
       (user_id, session_id, refresh_token_jti, expires_at, created_at, last_used_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    sessionId,
    jti,
    refreshExpiresAt,
    nowIso(),
    nowIso(),
    request.headers.get("User-Agent"),
    request.headers.get("CF-Connecting-IP"),
  );

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user.id, env.JWT_SECRET),
    signRefreshToken(user.id, sessionId, jti, env.JWT_SECRET, remember),
  ]);

  return { accessToken, refreshToken, sessionId, accessExpiresAt, refreshExpiresAt, refreshTtlSeconds };
}

/** Build the flat profile body (org + role joined) returned alongside auth cookies. */
export async function buildAuthBody(env: Env, user: UserRow, session: IssuedSession): Promise<AuthBody> {
  const membership = await queryFirst<{
    org_id: number;
    org_name: string;
    plan: string | null;
    role_id: number | null;
    role_name: string | null;
  }>(
    env.D1DB,
    `SELECT o.id AS org_id, o.name AS org_name, o.plan AS plan,
            r.id AS role_id, r.name AS role_name
       FROM membership m
       JOIN organization o ON o.id = m.org_id
       LEFT JOIN role r ON r.id = m.role_id
      WHERE m.user_id = ?
      LIMIT 1`,
    user.id,
  );

  // Site-wide admin flag - the login row may not have included this column so
  // re-read it directly. Cheap (single row by PK). Resolved through the
  // SUPER_ADMIN_EMAILS allowlist (when configured) so platform-owner status is
  // pinned to specific emails, not just any DB is_admin=1 - see adminAccess.ts.
  const adminRow = await queryFirst<{ is_admin: number }>(
    env.D1DB,
    `SELECT is_admin FROM "user" WHERE id = ?`,
    user.id,
  );

  // role_name comes off the membership row; owners normally have one ("Owner"),
  // but fall back to the org-owner check so an owner whose membership row lacks a
  // role still reports "Owner" (the per-org admin gate depends on this).
  let roleName = membership?.role_name ?? null;
  if (!roleName && membership?.org_id) {
    const owns = await queryFirst<{ ok: number }>(
      env.D1DB,
      `SELECT 1 AS ok FROM organization WHERE id = ? AND owner_id = ?`,
      membership.org_id, user.id,
    );
    if (owns) roleName = "Owner";
  }

  return {
    user_id: user.id,
    name: user.name,
    email: user.email,
    is_email_confirmed: Boolean(user.is_email_confirmed),
    is_admin: resolveSiteAdmin(env, user.email, adminRow?.is_admin === 1),
    org_id: membership?.org_id ?? null,
    org_name: membership?.org_name ?? null,
    role_id: membership?.role_id ?? null,
    role_name: roleName,
    plan: membership?.plan ?? null,
    access_token_expires_at: session.accessExpiresAt,
    refresh_token_expires_at: session.refreshExpiresAt,
    session_expires_at: session.refreshExpiresAt,
  };
}

/**
 * Resolve the authenticated user. Prefers the HttpOnly `access_token` cookie,
 * then falls back to an `Authorization: Bearer` header (older callers). Returns
 * null when neither yields a valid token - callers respond 401.
 */
export async function requireUser(env: Env, request: Request): Promise<UserRow | null> {
  const candidates: string[] = [];

  const cookieToken = readCookie(request, ACCESS_COOKIE);
  if (cookieToken) candidates.push(cookieToken);

  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) candidates.push(match[1]!);

  for (const token of candidates) {
    const claims = await verifyAccessToken(token, env.JWT_SECRET);
    if (claims) {
      return queryFirst<UserRow>(
        env.D1DB,
        `SELECT id, name, email, password_hash, is_email_confirmed FROM "user" WHERE id = ?`,
        Number(claims.sub),
      );
    }
  }
  return null;
}
