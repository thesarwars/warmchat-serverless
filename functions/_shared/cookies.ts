/// <reference types="@cloudflare/workers-types" />
import { tokenTtl } from "./jwt.ts";

/**
 * Cookie-based auth. Both tokens live in HttpOnly cookies (never exposed to JS,
 * so they survive XSS); a separate readable `wc_auth` cookie lets the UI know a
 * session exists without being able to read the tokens.
 *
 * Same-origin requests (frontend is served from the same domain as /api) send
 * these cookies automatically, so endpoints authenticate transparently.
 */

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
export const UI_COOKIE = "wc_auth"; // readable flag for the SPA

/** Cookies are Secure only over HTTPS so local http dev still works. */
function isSecure(request: Request): boolean {
  const proto = request.headers.get("X-Forwarded-Proto");
  if (proto) return proto.split(",")[0]!.trim() === "https";
  return new URL(request.url).protocol === "https:";
}

function serialize(
  name: string,
  value: string,
  opts: { maxAge: number; httpOnly: boolean; secure: boolean },
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${opts.maxAge}`,
  ];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Read a single cookie value from the request's Cookie header. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    if (pair.slice(0, idx).trim() === name) return pair.slice(idx + 1).trim();
  }
  return null;
}

/** Append Set-Cookie headers establishing a session on `response`. */
export function setAuthCookies(
  response: Response,
  tokens: { accessToken: string; refreshToken: string },
  request: Request,
  refreshMaxAge: number = tokenTtl.refresh,
): Response {
  const secure = isSecure(request);
  response.headers.append(
    "Set-Cookie",
    serialize(ACCESS_COOKIE, tokens.accessToken, { maxAge: tokenTtl.access, httpOnly: true, secure }),
  );
  response.headers.append(
    "Set-Cookie",
    serialize(REFRESH_COOKIE, tokens.refreshToken, { maxAge: refreshMaxAge, httpOnly: true, secure }),
  );
  response.headers.append(
    "Set-Cookie",
    serialize(UI_COOKIE, "1", { maxAge: refreshMaxAge, httpOnly: false, secure }),
  );
  return response;
}

/** Append Set-Cookie headers that expire all auth cookies. */
export function clearAuthCookies(response: Response, request: Request): Response {
  const secure = isSecure(request);
  for (const [name, httpOnly] of [
    [ACCESS_COOKIE, true],
    [REFRESH_COOKIE, true],
    [UI_COOKIE, false],
  ] as const) {
    response.headers.append("Set-Cookie", serialize(name, "", { maxAge: 0, httpOnly, secure }));
  }
  return response;
}
