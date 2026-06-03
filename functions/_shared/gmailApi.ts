/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst, execute, nowIso } from "./db.ts";
import { decryptSecret, encryptSecret } from "./crypto.ts";

/**
 * Gmail REST + OAuth helpers.
 *
 * The serverless side hits Google's HTTP APIs directly:
 *   - POST https://oauth2.googleapis.com/token   (refresh)
 *   - POST https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send
 *   - GET  https://gmail.googleapis.com/gmail/v1/users/me/threads
 */

interface OAuthTokensRow {
  id: number;
  refresh_token_encrypted: string;
  access_token_cache: string | null;
  access_token_expires_at: string | null;
  connection_id: number;
}

/** Get a valid access token for `connectionId`, refreshing if needed. */
export async function getGmailAccessToken(env: Env, connectionId: number): Promise<string | null> {
  const row = await queryFirst<OAuthTokensRow>(
    env.D1DB,
    `SELECT id, refresh_token_encrypted, access_token_cache, access_token_expires_at, connection_id
       FROM oauth_tokens WHERE connection_id = ? AND revoked_at IS NULL LIMIT 1`,
    connectionId,
  );
  if (!row) return null;

  const now = Date.now();
  if (row.access_token_cache && row.access_token_expires_at) {
    const exp = Date.parse(row.access_token_expires_at);
    if (Number.isFinite(exp) && exp - now > 60_000) return row.access_token_cache;
  }
  const refresh = await decryptSecret(row.refresh_token_encrypted, env.FERNET_KEY);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: env.GMAIL_OAUTH_CLIENT_ID,
      client_secret: env.GMAIL_OAUTH_CLIENT_SECRET,
    }).toString(),
  });
  if (!tokenRes.ok) return null;
  const t = await tokenRes.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(now + t.expires_in * 1000).toISOString();
  await execute(
    env.D1DB,
    `UPDATE oauth_tokens SET access_token_cache = ?, access_token_expires_at = ?, updated_at = ? WHERE id = ?`,
    t.access_token, expiresAt, nowIso(), row.id,
  );
  return t.access_token;
}

/** Save a brand-new (post-callback) Gmail OAuth token bundle. */
export async function saveGmailTokens(
  env: Env, connectionId: number, refreshToken: string, accessToken: string, expiresIn: number, scope?: string,
): Promise<void> {
  const enc = await encryptSecret(refreshToken, env.FERNET_KEY);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await execute(
    env.D1DB,
    `INSERT INTO oauth_tokens
       (connection_id, refresh_token_encrypted, access_token_cache, access_token_expires_at, scopes_granted, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    connectionId, enc, accessToken, expiresAt, scope || null, nowIso(),
  );
}

/** Send an email through Gmail REST. `rawRfc822` is the full message; we base64url it. */
export async function sendGmailMessage(accessToken: string, rawRfc822: string): Promise<{ id?: string; threadId?: string }> {
  const raw = btoa(unescape(encodeURIComponent(rawRfc822)))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export interface EmailAttachmentPart {
  filename: string;
  contentType: string;
  bytes: ArrayBuffer | Uint8Array;
}

function base64Encode(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as number[]);
  }
  return btoa(binary);
}

function chunkBase64(b64: string, lineLen = 76): string {
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += lineLen) out.push(b64.slice(i, i + lineLen));
  return out.join("\r\n");
}

/** Build an RFC822 message, multipart/mixed when attachments are present. */
export function buildRfc822({ to, from, subject, body, isHtml = false, inReplyTo, references, attachments }: {
  to: string; from: string; subject: string; body: string;
  isHtml?: boolean; inReplyTo?: string; references?: string;
  attachments?: EmailAttachmentPart[];
}): string {
  const baseHeaders = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
  ];
  if (inReplyTo) baseHeaders.push(`In-Reply-To: ${inReplyTo}`);
  if (references) baseHeaders.push(`References: ${references}`);

  if (!attachments?.length) {
    return [
      ...baseHeaders,
      `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=UTF-8`,
    ].join("\r\n") + "\r\n\r\n" + body;
  }

  const boundary = `=_wc_${crypto.randomUUID().replace(/-/g, "")}`;
  const lines: string[] = [
    ...baseHeaders,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    "",
    body,
  ];
  for (const att of attachments) {
    const b64 = chunkBase64(base64Encode(att.bytes));
    const safeName = att.filename.replace(/[\r\n"]/g, "_");
    lines.push(
      `--${boundary}`,
      `Content-Type: ${att.contentType || "application/octet-stream"}; name="${safeName}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${safeName}"`,
      "",
      b64,
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

/** List Gmail threads (max 50) for the inbox-thread sync UI. */
export async function listGmailThreads(accessToken: string, maxResults = 50): Promise<unknown[]> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return [];
  const j = await res.json() as { threads?: unknown[] };
  return j.threads || [];
}
