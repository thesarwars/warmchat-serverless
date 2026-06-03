/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { error } from "../../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../../_shared/db.ts";
import { saveGmailTokens } from "../../../_shared/gmailApi.ts";

/**
 * GET /api/gmail/oauth/callback?code=...&state=user_id.nonce - exchange code
 * for tokens, persist email_connections + oauth_tokens, redirect to FE.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  if (!code) return error("code is required", 400);

  const userId = Number(state.split(".")[0]);
  if (!Number.isInteger(userId)) return error("Invalid state", 400);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GMAIL_OAUTH_CLIENT_ID,
      client_secret: env.GMAIL_OAUTH_CLIENT_SECRET,
      redirect_uri: env.GMAIL_OAUTH_REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!tokenRes.ok) return error(`Google token exchange failed: ${await tokenRes.text()}`, 502);
  const t = await tokenRes.json() as {
    access_token: string; refresh_token: string; id_token?: string;
    expires_in: number; scope?: string;
  };

  // Fetch user info to learn the connected Gmail address.
  const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  const info = userInfoRes.ok ? await userInfoRes.json() as { email?: string; sub?: string } : {};
  const email = info.email || "";
  const googleSub = info.sub || null;
  if (!email) return error("Could not read Gmail address", 502);

  const membership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, userId,
  );
  let conn = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM email_connections WHERE user_id = ? AND email_address = ? LIMIT 1`,
    userId, email,
  );
  if (!conn) {
    const ins = await execute(
      env.D1DB,
      `INSERT INTO email_connections (tenant_id, user_id, provider, status, email_address, google_sub, scopes_granted, created_at, updated_at)
       VALUES (?, ?, 'gmail', 'active', ?, ?, ?, ?, ?)`,
      membership?.org_id ?? null, userId, email, googleSub, t.scope || null, nowIso(), nowIso(),
    );
    conn = { id: Number(ins.meta.last_row_id) };
  } else {
    await execute(
      env.D1DB,
      `UPDATE email_connections SET status = 'active', google_sub = ?, scopes_granted = ?, updated_at = ? WHERE id = ?`,
      googleSub, t.scope || null, nowIso(), conn.id,
    );
  }

  await saveGmailTokens(env, conn.id, t.refresh_token, t.access_token, t.expires_in, t.scope);
  // ConnectAccount.tsx handles ?status=success on this route, then honors the
  // gmail_oauth_return localStorage value to return to onboarding/dashboard.
  return Response.redirect(`${env.FRONTEND_URL}/connect-email/gmail?status=success`, 302);
};
