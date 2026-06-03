/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET /api/gmail/connect-url - Google OAuth consent URL.
 * Generates the URL using GMAIL_OAUTH_CLIENT_ID + GMAIL_OAUTH_REDIRECT_URI.
 * The full OAuth round-trip + token storage lives in Phase 4 (oauth/callback).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!env.GMAIL_OAUTH_CLIENT_ID || !env.GMAIL_OAUTH_REDIRECT_URI) {
    return error("Gmail OAuth is not configured", 503);
  }

  const scope = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "openid", "email", "profile",
  ].join(" ");
  const state = `${user.id}.${crypto.randomUUID()}`;

  const params = new URLSearchParams({
    client_id: env.GMAIL_OAUTH_CLIENT_ID,
    redirect_uri: env.GMAIL_OAUTH_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope,
    state,
  });
  return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, state });
};
