/// <reference types="@cloudflare/workers-types" />

/**
 * Cron-side mirror of functions/_shared/emailCompliance.ts. Same token format
 * + footer renderer so links the cron emits verify in the Pages-Functions
 * unsubscribe handler. Two copies because the cron and Pages bundles can't
 * cross-import; see workers/cron/_shared/quietHours.ts for the same pattern.
 *
 * If you change one, change both.
 */

const UNSUB_PREFIX = "unsub:";
const DEFAULT_BASE_URL = "https://www.warmchats.com";

function buf(x: Uint8Array): BufferSource {
  return x as unknown as BufferSource;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    buf(new TextEncoder().encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function makeUnsubscribeToken(leadId: number, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const data = buf(new TextEncoder().encode(`${UNSUB_PREFIX}${leadId}`));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return b64url(sig);
}

export function unsubscribeUrl(leadId: number, token: string, baseUrl?: string): string {
  const base = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return `${base}/api/email/unsubscribe?l=${leadId}&t=${encodeURIComponent(token)}`;
}

export interface FooterOptions {
  businessAddress: string;
  unsubscribeUrl: string;
  senderName?: string | null;
}

export function appendCanSpamFooter(bodyHtml: string, opts: FooterOptions): string {
  const body = bodyHtml || "";
  if (/unsubscribe/i.test(body) && /href=/i.test(body)) return body;
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
