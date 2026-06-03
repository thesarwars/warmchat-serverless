/// <reference types="@cloudflare/workers-types" />

/**
 * CAN-SPAM compliance helpers for marketing emails (automations + sequences).
 *
 * Transactional 1:1 sends (appointment confirmations, inbox composer replies)
 * are exempt from the marketing-footer requirement and SHOULD NOT use these
 * helpers - the footer would feel out of place on a conversational reply.
 *
 * Token format: base64url( HMAC-SHA256(EMAIL_UNSUB_SIGNING_KEY, "unsub:" + leadId) )
 * Non-expiring so old archived emails keep working (CAN-SPAM expects the
 * unsubscribe to remain functional for at least 30 days; we leave it forever).
 * The org_id is resolved from lead_id on the server side, so the link only
 * needs the lead-id + token.
 *
 * Rotation: changing EMAIL_UNSUB_SIGNING_KEY invalidates every previously
 * issued token. If we ever rotate again with real email volume in the field,
 * add a dual-verify path that accepts both the new key and a saved previous
 * one for a transition window.
 */

const UNSUB_PREFIX = "unsub:";

function buf(x: Uint8Array): BufferSource {
  return x as unknown as BufferSource;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    buf(new TextEncoder().encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function makeUnsubscribeToken(leadId: number, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const data = buf(new TextEncoder().encode(`${UNSUB_PREFIX}${leadId}`));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return b64url(sig);
}

export async function verifyUnsubscribeToken(
  token: string,
  leadId: number,
  secret: string,
): Promise<boolean> {
  if (!token || !Number.isFinite(leadId)) return false;
  try {
    const key = await hmacKey(secret);
    const data = buf(new TextEncoder().encode(`${UNSUB_PREFIX}${leadId}`));
    return await crypto.subtle.verify("HMAC", key, buf(b64urlDecode(token)), data);
  } catch {
    return false;
  }
}

/**
 * Default public base for unsubscribe links. Workers/Pages don't have a stable
 * request URL in cron context, so callers should pass `baseUrl` when they have
 * one; this is the fallback for the production deployment.
 */
const DEFAULT_BASE_URL = "https://www.warmchats.com";

export function unsubscribeUrl(leadId: number, token: string, baseUrl?: string): string {
  const base = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return `${base}/api/email/unsubscribe?l=${leadId}&t=${encodeURIComponent(token)}`;
}

export interface FooterOptions {
  /** Required - sender's real-world mailing address (agent's business address). */
  businessAddress: string;
  /** Per-recipient unsubscribe URL (signed). */
  unsubscribeUrl: string;
  /** Sender name (agent). Renders as "You're receiving this from {senderName}." */
  senderName?: string | null;
}

/**
 * Append a CAN-SPAM compliant footer to an HTML marketing email body.
 *
 * Required by 15 U.S.C. § 7704(a)(5):
 *   - A clear opt-out mechanism (the link).
 *   - The sender's valid physical postal address.
 *
 * Idempotent: if the body already carries an "Unsubscribe" link we leave it
 * alone so a user-authored template with its own opt-out link doesn't get a
 * duplicate footer.
 */
export function appendCanSpamFooter(bodyHtml: string, opts: FooterOptions): string {
  const body = bodyHtml || "";
  if (/unsubscribe/i.test(body) && /href=/i.test(body)) {
    // Body already has an unsubscribe link - assume the user provided one and
    // skip adding our own to avoid two competing links.
    return body;
  }
  const address = escapeHtml(opts.businessAddress);
  const senderLine = opts.senderName
    ? `<div>You're receiving this email from ${escapeHtml(opts.senderName)}.</div>`
    : "";
  const footer = [
    "<br><br>",
    "<hr style=\"border:none;border-top:1px solid #ddd;margin:24px 0 12px\">",
    "<div style=\"color:#666;font-size:12px;line-height:1.5\">",
    senderLine,
    `<div>${address}</div>`,
    `<div><a href="${opts.unsubscribeUrl}" style="color:#666">Unsubscribe</a></div>`,
    "</div>",
  ].join("");
  return body + footer;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
