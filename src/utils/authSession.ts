import { mixpanelIdentify, mixpanelReset } from "../lib/mixpanel";

export type AuthPayload = {
  access_token?: string;
  token?: string;
  refresh_token?: string;
  user_id?: string | number;
  name?: string;
  email?: string;
  role_id?: string | number;
  role_name?: string;
  is_admin?: boolean;
  org_id?: string | number;
  org_name?: string;
  plan?: string;
  onboardingStep?: string | number;
  access_token_expires_at?: string;
  refresh_token_expires_at?: string;
  session_expires_at?: string;
};

export type AuthSessionSnapshot = {
  token: string;
  refreshToken: string;
  tokenExpiryMs: number | null;
  refreshTokenExpiryMs: number | null;
  sessionExpiresAt: string;
  userId: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  orgId: string;
  orgName: string;
  plan: string;
  onboardingStep: string;
  accountKey: string;
};

const EMPTY_AUTH_SESSION: AuthSessionSnapshot = {
  token: "",
  refreshToken: "",
  tokenExpiryMs: null,
  refreshTokenExpiryMs: null,
  sessionExpiresAt: "",
  userId: "",
  name: "",
  email: "",
  roleId: "",
  roleName: "",
  orgId: "",
  orgName: "",
  plan: "",
  onboardingStep: "",
  accountKey: "guest",
};

const AUTH_STORAGE_KEYS = [
  "auth_active",
  "token",
  "token_exp",
  "refresh_token",
  "refresh_token_exp",
  "session_expires_at",
  "user_id",
  "name",
  "role_id",
  "role_name",
  "is_admin",
  "org_id",
  "org_name",
  "selectedPlan",
  "plan",
  "email",
  "onboardingStep",
  // Routing-stash flags - stale across users on shared devices and pointless
  // once the session is gone.
  "isInvited",
  "upgrade_from_onboarding",
  "sms_onboarding_return",
  "gmail_oauth_return",
] as const;

const AUTH_SESSION_EVENT = "warmchats:auth-session-changed";

let refreshPromise: Promise<string | null> | null = null;
let cachedAuthSessionSnapshot: AuthSessionSnapshot = EMPTY_AUTH_SESSION;
let cachedAuthSessionSignature = "";

// Boot-time backfill: pre-existing sessions (logged in before the cookie
// migration set this sentinel) had `auth_active` but no `token`. Without the
// sentinel, the ~40 older components that gate fetches on
// `localStorage.getItem("token")` would never load. Set it once on import.
if (typeof window !== "undefined") {
  if (localStorage.getItem("auth_active") === "1" && !localStorage.getItem("token")) {
    localStorage.setItem("token", "cookie");
  }
}

// function decodeJwtPayload(jwt?: string | null) {
//   if (!jwt) return null;

//   try {
//     const payload = jwt.split(".")[1] || "";
//     const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
//     const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
//     return JSON.parse(atob(padded));
//   } catch (err) {
//     console.error("JWT decode failed:", err);
//     return null;
//   }
// }

export function clearStoredAuthState() {
  AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  syncAuthSessionSnapshot(true);
  emitAuthSessionChange();
  mixpanelReset();
}

function emitAuthSessionChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT));
}

function setStorageValue(key: string, value: string | number | null | undefined) {
  if (value === undefined || value === null || value === "") return;
  localStorage.setItem(key, String(value));
}

function parseIsoMs(value?: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Persist the session. Tokens themselves now live in HttpOnly cookies and are
 * never seen by JS - we only store non-sensitive profile fields plus the token
 * expiry timestamps (so we can refresh proactively) and an `auth_active` flag
 * the UI/route guards key off. Safe to call with a partial payload (e.g. the
 * refresh response, which carries only the new expiries).
 */
export function storeAuthSession(payload: AuthPayload) {
  const accessExpiryMs = parseIsoMs(payload.access_token_expires_at);
  if (accessExpiryMs) localStorage.setItem("token_exp", String(accessExpiryMs));

  const refreshExpiryMs = parseIsoMs(payload.refresh_token_expires_at);
  if (refreshExpiryMs) {
    localStorage.setItem("refresh_token_exp", String(refreshExpiryMs));
    localStorage.setItem("session_expires_at", new Date(refreshExpiryMs).toISOString());
  } else if (payload.session_expires_at) {
    localStorage.setItem("session_expires_at", payload.session_expires_at);
  }

  // Mark the session active whenever we learn of identity or a live refresh window.
  if (payload.user_id || refreshExpiryMs) {
    localStorage.setItem("auth_active", "1");
    // Sentinel for the ~40 older components that gate fetches on
    // `localStorage.getItem("token")`. Not a real JWT - the actual auth
    // rides on the HttpOnly cookie, and App.tsx's fetch interceptor strips
    // any stale `Authorization: Bearer ...` header before sending /api calls.
    localStorage.setItem("token", "cookie");
  }

  setStorageValue("user_id", payload.user_id);
  setStorageValue("name", payload.name);
  setStorageValue("email", payload.email);
  setStorageValue("role_id", payload.role_id);
  setStorageValue("role_name", payload.role_name);
  // Site-wide admin flag (separate from per-org role) - gates /admin/* in the UI.
  if (payload.is_admin !== undefined) {
    localStorage.setItem("is_admin", payload.is_admin ? "1" : "0");
  }
  setStorageValue("org_id", payload.org_id);
  setStorageValue("org_name", payload.org_name);
  setStorageValue("plan", payload.plan);
  setStorageValue("selectedPlan", payload.plan);
  setStorageValue("onboardingStep", payload.onboardingStep);
  syncAuthSessionSnapshot(true);
  emitAuthSessionChange();

  if (payload.user_id) {
    mixpanelIdentify(String(payload.user_id), {
      email: payload.email,
      name: payload.name,
      org_id: payload.org_id != null ? String(payload.org_id) : undefined,
      org_name: payload.org_name,
      role: payload.role_name,
      plan: payload.plan,
    });
  }
}

function readAuthSessionSnapshot(): AuthSessionSnapshot {
  if (typeof window === "undefined") {
    return EMPTY_AUTH_SESSION;
  }

  // Tokens are HttpOnly cookies (not readable here). `token`/`refreshToken`
  // in the snapshot now reflect whether a session is active, for UI gating.
  const active = localStorage.getItem("auth_active") === "1";
  const token = active ? "active" : "";
  const refreshToken = active ? "active" : "";
  const sessionExpiresAt = localStorage.getItem("session_expires_at") || "";
  const userId = localStorage.getItem("user_id") || "";
  const orgId = localStorage.getItem("org_id") || "";

  return {
    token,
    refreshToken,
    tokenExpiryMs: getStoredAccessTokenExpiryMs(),
    refreshTokenExpiryMs: getStoredRefreshTokenExpiryMs(),
    sessionExpiresAt,
    userId,
    name: localStorage.getItem("name") || "",
    email: localStorage.getItem("email") || "",
    roleId: localStorage.getItem("role_id") || "",
    roleName: localStorage.getItem("role_name") || "",
    orgId,
    orgName: localStorage.getItem("org_name") || "",
    plan: localStorage.getItem("plan") || "",
    onboardingStep: localStorage.getItem("onboardingStep") || "",
    accountKey: `${userId || "guest"}:${orgId || "no-org"}`,
  };
}

function buildAuthSessionSignature(snapshot: AuthSessionSnapshot) {
  return [
    snapshot.token,
    snapshot.refreshToken,
    snapshot.tokenExpiryMs ?? "",
    snapshot.refreshTokenExpiryMs ?? "",
    snapshot.sessionExpiresAt,
    snapshot.userId,
    snapshot.name,
    snapshot.email,
    snapshot.roleId,
    snapshot.roleName,
    snapshot.orgId,
    snapshot.orgName,
    snapshot.plan,
    snapshot.onboardingStep,
    snapshot.accountKey,
  ].join("|");
}

function syncAuthSessionSnapshot(force = false): AuthSessionSnapshot {
  const nextSnapshot = readAuthSessionSnapshot();
  const nextSignature = buildAuthSessionSignature(nextSnapshot);

  if (force || nextSignature !== cachedAuthSessionSignature) {
    cachedAuthSessionSignature = nextSignature;
    cachedAuthSessionSnapshot = nextSnapshot;
  }

  return cachedAuthSessionSnapshot;
}

export function getStoredAuthSession(): AuthSessionSnapshot {
  return syncAuthSessionSnapshot();
}

export function subscribeToAuthSession(listener: () => void) {
  if (typeof window === "undefined") {
    return (): void => undefined;
  }

  const handleSessionChange = () => {
    syncAuthSessionSnapshot(true);
    listener();
  };
  const handleStorage = (event: StorageEvent) => {
    if (!event.key || AUTH_STORAGE_KEYS.includes(event.key as (typeof AUTH_STORAGE_KEYS)[number])) {
      syncAuthSessionSnapshot(true);
      listener();
    }
  };

  window.addEventListener(AUTH_SESSION_EVENT, handleSessionChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(AUTH_SESSION_EVENT, handleSessionChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function isSessionActive() {
  return localStorage.getItem("auth_active") === "1";
}

// function getStoredRefreshToken(): string | null {
//   return null;
// }

function getStoredAccessTokenExpiryMs() {
  const raw = localStorage.getItem("token_exp");
  return raw ? Number(raw) : null;
}

function getStoredRefreshTokenExpiryMs() {
  const raw = localStorage.getItem("refresh_token_exp");
  return raw ? Number(raw) : null;
}

function isTokenExpired(expiryMs: number | null, bufferMs = 0) {
  if (!expiryMs) return false;
  return Date.now() + bufferMs >= expiryMs;
}

export function hasRefreshToken() {
  if (!isSessionActive()) return false;
  return !isTokenExpired(getStoredRefreshTokenExpiryMs(), 0);
}

export function shouldRefreshAccessToken(bufferMs = 60_000) {
  if (!isSessionActive()) return false;
  const accessExpiry = getStoredAccessTokenExpiryMs();
  if (!accessExpiry) return false;
  return isTokenExpired(accessExpiry, bufferMs);
}

/**
 * Rotate the session. The refresh token rides along as an HttpOnly cookie, so
 * no body/header is sent; the new tokens come back as Set-Cookie. Resolves to a
 * sentinel string on success (callers only check truthiness) or null on failure.
 */
export async function refreshAuthSession(
  apiBase: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    if (!isSessionActive()) return null;

    if (isTokenExpired(getStoredRefreshTokenExpiryMs(), 0)) {
      clearStoredAuthState();
      return null;
    }

    const response = await fetchImpl(`${apiBase}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    let data: AuthPayload;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      clearStoredAuthState();
      return null;
    }

    // Persist the new expiries (tokens themselves are now fresh cookies).
    storeAuthSession(data);
    return "ok";
  })()
    .catch((err): string | null => {
      console.error("Auth refresh failed:", err);
      clearStoredAuthState();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function logoutCurrentSession(apiBase: string) {
  try {
    await fetch(`${apiBase}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch (err) {
    console.error("Logout request failed:", err);
  } finally {
    clearStoredAuthState();
  }
}
