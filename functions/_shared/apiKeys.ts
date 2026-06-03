/// <reference types="@cloudflare/workers-types" />

/**
 * Long-lived API key generation + hashing for external integrations (Zapier).
 *
 * Keys look like `wc_live_<43 base64url chars>` (32 random bytes). They are
 * shown to the user exactly ONCE on creation; we persist only the SHA-256 hash
 * plus a short `key_prefix` for display. Because the key is high-entropy random
 * (256 bits), a single SHA-256 is a safe one-way store AND cheap - we must NOT
 * use PBKDF2 here or we blow the free-tier 10ms CPU/request cap.
 */

const KEY_PREFIX = "wc_live_";
/** Chars of the full key shown in the UI after the `wc_live_` prefix. */
const DISPLAY_CHARS = 4;

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Mint a fresh key. `full` is returned to the user once; `prefix` (e.g.
 * "wc_live_3f9a") is stored for display.
 */
export function generateApiKey(): { full: string; prefix: string } {
  const random = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const full = `${KEY_PREFIX}${random}`;
  const prefix = `${KEY_PREFIX}${random.slice(0, DISPLAY_CHARS)}`;
  return { full, prefix };
}

/** SHA-256 hex of the full key - the value stored in api_key.key_hash. */
export async function hashApiKey(full: string): Promise<string> {
  const data = new TextEncoder().encode(full);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cheap shape check so we don't hash arbitrary bearer tokens (e.g. JWTs). */
export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX);
}
