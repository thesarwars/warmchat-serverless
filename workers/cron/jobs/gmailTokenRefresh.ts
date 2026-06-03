/// <reference types="@cloudflare/workers-types" />
/**
 * Gmail OAuth token refresher.
 *
 * Refreshes any `oauth_tokens` row whose cached access_token is about to
 * expire (within REFRESH_WITHIN_MS), so user-facing requests never block on a
 * Google round-trip.
 *
 * IMPORTANT: this cron fires every minute, but Google access tokens live ~1h.
 * The refresh window MUST stay well under that lifetime - otherwise a token we
 * just refreshed (new expiry ~now+1h) still matches the query on the next tick
 * and we'd hammer Google's token endpoint once per minute per connection. A
 * 10-minute window means each token is touched only in its final 10 minutes,
 * i.e. roughly once every ~50 minutes per connection.
 */
import type { CronEnv } from "../env.ts";

interface TokenRow {
  id: number;
  connection_id: number;
  refresh_token_encrypted: string;
  access_token_expires_at: string | null;
}

const REFRESH_WITHIN_MS = 10 * 60 * 1000; // 10 minutes - see note above.

export async function runGmailTokenRefresh(env: CronEnv): Promise<void> {
  const horizon = new Date(Date.now() + REFRESH_WITHIN_MS).toISOString();
  const { results } = await env.D1DB.prepare(
    `SELECT id, connection_id, refresh_token_encrypted, access_token_expires_at
       FROM oauth_tokens
      WHERE revoked_at IS NULL
        AND (access_token_expires_at IS NULL OR access_token_expires_at <= ?)
      LIMIT 50`,
  ).bind(horizon).all<TokenRow>();

  const due = results ?? [];
  if (due.length === 0) {
    console.log("[cron:gmailTokenRefresh] no tokens within 10m of expiry - nothing to do");
    return;
  }
  console.log(`[cron:gmailTokenRefresh] ${due.length} token(s) near expiry`);

  let refreshed = 0, skipped = 0, failed = 0;
  for (const row of due) {
    try {
      const refresh = await decryptRefresh(env, row.refresh_token_encrypted);
      if (!refresh) {
        skipped++;
        console.warn(`[cron:gmailTokenRefresh] token=${row.id} conn=${row.connection_id} - no usable refresh token, skipping`);
        continue;
      }
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refresh,
          client_id: env.GMAIL_OAUTH_CLIENT_ID,
          client_secret: env.GMAIL_OAUTH_CLIENT_SECRET,
        }).toString(),
      });
      if (!res.ok) {
        failed++;
        console.error(`[cron:gmailTokenRefresh] token=${row.id} conn=${row.connection_id} - Google returned HTTP ${res.status}`);
        continue;
      }
      const t = await res.json() as { access_token: string; expires_in: number };
      const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString();
      await env.D1DB.prepare(
        `UPDATE oauth_tokens
           SET access_token_cache = ?, access_token_expires_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).bind(t.access_token, expiresAt, row.id).run();
      refreshed++;
      console.log(`[cron:gmailTokenRefresh] token=${row.id} conn=${row.connection_id} -> refreshed, new expiry ${expiresAt}`);
    } catch (err) {
      failed++;
      console.error(`[cron:gmailTokenRefresh] token=${row.id} refresh failed`, err);
    }
  }
  console.log(`[cron:gmailTokenRefresh] summary: refreshed=${refreshed} skipped=${skipped} failed=${failed}`);
}

/** Mini-port of crypto.decryptSecret - duplicated to keep the Worker dep-free. */
async function decryptRefresh(env: CronEnv, packed: string): Promise<string | null> {
  if (!packed.startsWith("v1:")) return packed; // unprefixed plaintext
  const rest = packed.slice(3);
  const dot = rest.indexOf(".");
  if (dot < 0) return null;
  const ivB64 = rest.slice(0, dot);
  const ctB64 = rest.slice(dot + 1);
  const iv = b64dec(ivB64);
  const ct = b64dec(ctB64);
  const enc = new TextEncoder().encode(env.FERNET_KEY);
  const digest = await crypto.subtle.digest("SHA-256", enc as unknown as BufferSource);
  const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource }, key, ct as unknown as BufferSource,
    );
    return new TextDecoder().decode(pt);
  } catch { return null; }
}

function b64dec(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
