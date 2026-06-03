/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";

/**
 * ElasticEmail REST client. Workers can't open raw SMTP sockets, so the
 *
 * Reference: https://elasticemail.com/developers/api-documentation/rest-api
 * Uses the v4 `/emails/transactional` endpoint when available, falling back
 * to v2 `/email/send`. Currently we hit v2 because v4 requires per-domain
 * verification we haven't implemented yet.
 */

export interface SendEmailAttachment {
  filename: string;
  contentType: string;
  bytes: ArrayBuffer | Uint8Array;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  body: string;             // HTML or plaintext
  isHtml?: boolean;
  fromEmail?: string;       // defaults to ELASTIC_SENDER_EMAIL
  fromName?: string;        // defaults to ELASTIC_SENDER_NAME
  replyTo?: string;
  transactional?: boolean;  // when true, suppresses ElasticEmail's appended unsubscribe footer
  attachments?: SendEmailAttachment[];
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string | undefined;
  error?: string | undefined;
  raw?: unknown;
}

export async function sendEmail(env: Env, input: SendEmailInput): Promise<SendEmailResult> {
  if (!env.ELASTIC_EMAIL_API_KEY) {
    return { ok: false, error: "ElasticEmail not configured" };
  }
  const to = Array.isArray(input.to) ? input.to.join(",") : input.to;
  const fromEmail = input.fromEmail || env.ELASTIC_SENDER_EMAIL;
  const fromName = input.fromName || env.ELASTIC_SENDER_NAME;

  const fields: Record<string, string> = {
    apikey: env.ELASTIC_EMAIL_API_KEY,
    subject: input.subject,
    from: fromEmail,
    fromName,
    to,
  };
  if (input.replyTo) fields.replyTo = input.replyTo;
  if (input.transactional) fields.isTransactional = "true";
  if (input.isHtml === false) fields.bodyText = input.body;
  else fields.bodyHtml = input.body;

  // CAN-SPAM / RFC 8058 List-Unsubscribe header. ElasticEmail's v2 endpoint
  // accepts `headers_listunsubscribe` and forwards it untouched. We always
  // include a mailto: target so Gmail / Outlook surface the "Unsubscribe"
  // chip on every outbound, even when the body's footer link is missing.
  const supportEmail = (env.SUPPORT_EMAIL || "").trim() || "unsubscribe@" + (env.REPLY_DOMAIN || "warmchats.com");
  fields.headers_listunsubscribe = `<mailto:${supportEmail}?subject=unsubscribe>`;

  let res: Response;
  if (input.attachments?.length) {
    // Multipart form upload - ElasticEmail v2 accepts file parts with the
    // field name as the filename so they get attached to the outbound message.
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const att of input.attachments) {
      const blob = new Blob([att.bytes as ArrayBuffer], { type: att.contentType || "application/octet-stream" });
      form.append(att.filename, blob, att.filename);
    }
    res = await fetch("https://api.elasticemail.com/v2/email/send", {
      method: "POST",
      body: form,
    });
  } else {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) params.set(k, v);
    res = await fetch("https://api.elasticemail.com/v2/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  }
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: { messageid?: string; transactionid?: string }; error?: string }
    | null;
  if (!res.ok || !json?.success) {
    return { ok: false, error: json?.error || `HTTP ${res.status}`, raw: json };
  }
  return { ok: true, messageId: json.data?.messageid || json.data?.transactionid, raw: json };
}

/** Add an inbound mail "route" - when an email arrives at this address, ElasticEmail POSTs to our webhook. */
export async function addInboundRoute(
  env: Env, domain: string, webhookUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!env.ELASTIC_EMAIL_API_KEY) return { ok: false, error: "ElasticEmail not configured" };
  const params = new URLSearchParams();
  params.set("apikey", env.ELASTIC_EMAIL_API_KEY);
  params.set("domain", domain);
  params.set("notificationUrl", webhookUrl);
  const res = await fetch("https://api.elasticemail.com/v2/domain/addinboundroute", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  return json?.success ? { ok: true } : { ok: false, error: json?.error || "addInboundRoute failed" };
}

export interface ElasticDomainRecord {
  domain: string;
  spfVerified: boolean;
  dkimVerified: boolean;
  trackingVerified: boolean;
  mxVerified: boolean;
  dkimSelector: string;   // typically "api._domainkey"
  dkimValue: string;      // TXT record value, e.g. "k=rsa;p=..."
  spfValue: string;       // expected TXT record value
  trackingHost: string;   // expected CNAME host (e.g. "tracking.<domain>")
  trackingValue: string;  // expected CNAME target ("api.elasticemail.com")
}

// ElasticEmail issues a single account-wide DKIM public key that's reused as
// the TXT value at api._domainkey.<any-domain-you-add>. Pulled from the
// Warmchats LLC Elastic dashboard once and hardcoded since it never rotates
// per-domain. If we ever change Elastic accounts, replace this value with the
// new account's DKIM record (Settings -> Domains -> click any verified domain).
const ELASTIC_ACCOUNT_DKIM_TXT =
  "k=rsa;t=s;p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCbmGbQMzYeMvxwt" +
  "NQoXN0waGYaciuKx8mtMh5czguT4EZlJXuCt6V+l56mmt3t68FEX5JJ0q4ijG71BG" +
  "oFRkl87uJi7LrQt1ZZmZCvrEII0YO4mp8sDLXC8g1aUAoi8TJgxq2MJqCaMyj5kAm" +
  "3Fdy2tzftPCV/lbdiJqmBnWKjtwIDAQAB";

/**
 * Get DNS records for a domain (SPF/DKIM/tracking). /v2/domain/list reports
 * per-domain verification booleans; the DKIM TXT value itself is the same
 * account-wide constant on every domain (see ELASTIC_ACCOUNT_DKIM_TXT above).
 */
export async function getDomainRecords(
  env: Env, domain: string,
): Promise<{ ok: boolean; data?: ElasticDomainRecord; error?: string; raw?: unknown }> {
  if (!env.ELASTIC_EMAIL_API_KEY) return { ok: false, error: "ElasticEmail not configured" };

  const apikey = encodeURIComponent(env.ELASTIC_EMAIL_API_KEY);
  const listRes = await fetch(`https://api.elasticemail.com/v2/domain/list?apikey=${apikey}`).catch(() => null);
  if (!listRes || !listRes.ok) return { ok: false, error: `HTTP ${listRes?.status ?? "?"}` };

  const listJson = await listRes.json().catch(() => null) as
    | { success?: boolean; data?: Array<Record<string, unknown>>; error?: string }
    | null;
  if (!listJson?.success) return { ok: false, error: listJson?.error || "domain/list failed" };

  const target = domain.trim().toLowerCase();
  const entries = Array.isArray(listJson.data) ? listJson.data : [];
  const entry = entries.find((d) =>
    String(d.domain ?? d.Domain ?? "").trim().toLowerCase() === target,
  ) || {};

  return {
    ok: true,
    raw: entry,
    data: {
      domain: target,
      spfVerified:      Boolean(entry.spf ?? entry.Spf),
      dkimVerified:     Boolean(entry.dkim ?? entry.Dkim),
      trackingVerified: Boolean(entry.tracking ?? entry.Tracking),
      mxVerified:       Boolean(entry.mx ?? entry.MX),
      dkimSelector:     "api._domainkey",
      dkimValue:        ELASTIC_ACCOUNT_DKIM_TXT,
      spfValue:         "v=spf1 a mx include:_spf.elasticemail.com ~all",
      trackingHost:     `tracking.${target}`,
      trackingValue:    "api.elasticemail.com",
    },
  };
}

/** Resolve TXT/CNAME/MX records via DNS-over-HTTPS so the UI can show the
 *  user what their DNS currently publishes (vs what we expect). Tries
 *  Cloudflare first then falls back to Google's DoH so a cache miss on one
 *  resolver doesn't make us say "not found" for a record that's been added.
 */
export async function lookupDns(name: string, type: "TXT" | "CNAME" | "MX"): Promise<string[]> {
  // RFC 1035 record type numbers: A=1, CNAME=5, MX=15, TXT=16.
  const wanted = type === "TXT" ? 16 : type === "CNAME" ? 5 : 15;

  const parse = (raw: string): string => {
    if (type === "TXT") {
      // DoH JSON returns TXT as one string; long TXTs are stored as multiple
      // 255-byte chunks in DNS and may surface as either:
      //   "\"chunk1\" \"chunk2\""  (Cloudflare style)
      //   "\"chunk1chunk2\""       (Google style, already joined)
      // Strip ALL quote characters and any space that sits between two non-quote
      // chars where the previous char was a quote-stripped chunk boundary.
      // Simpler: drop every `"` then collapse `"`-separated whitespace too.
      // The regex below removes `" "` (or multiple spaces between quotes) AND
      // any standalone quote chars left over.
      return raw.replace(/"\s*"/g, "").replace(/^"|"$/g, "").replace(/"/g, "");
    }
    if (type === "MX") {
      // MX rdata is "<priority> <hostname>." - normalize to hostname only,
      // lowercased, no trailing dot.
      const parts = raw.split(/\s+/);
      const host = parts[parts.length - 1] || raw;
      return host.replace(/\.$/, "").toLowerCase();
    }
    return raw.replace(/\.$/, "");
  };

  const queryProvider = async (url: string): Promise<string[]> => {
    try {
      const res = await fetch(url, { headers: { Accept: "application/dns-json" } });
      if (!res.ok) return [];
      const json = await res.json() as { Answer?: { type: number; data: string }[] };
      if (!Array.isArray(json.Answer)) return [];
      return json.Answer
        .filter((a) => a.type === wanted)
        .map((a) => parse(a.data || ""))
        .filter((s) => s.length > 0);
    } catch {
      return [];
    }
  };

  const enc = encodeURIComponent(name);
  // Cloudflare's resolver is usually fastest for records hosted on Cloudflare
  // DNS, but it has its own cache. Google's resolver is independent so falling
  // back catches the case where one resolver has stale "not found" cached.
  const cf = await queryProvider(`https://cloudflare-dns.com/dns-query?name=${enc}&type=${type}`);
  if (cf.length > 0) return cf;
  return queryProvider(`https://dns.google/resolve?name=${enc}&type=${type}`);
}

/** Classify a domain's MX records into something the UI can act on. */
export type MxStatus = "none" | "elastic" | "google" | "microsoft" | "other";
export async function detectMxStatus(domain: string): Promise<{ status: MxStatus; hosts: string[] }> {
  const hosts = await lookupDns(domain, "MX");
  if (hosts.length === 0) return { status: "none", hosts };
  const has = (sub: string) => hosts.some((h) => h.includes(sub));
  if (has("elasticemail")) return { status: "elastic", hosts };
  if (has("google.com") || has("googlemail")) return { status: "google", hosts };
  if (has("outlook.com") || has("protection.outlook") || has("mail.protection")) return { status: "microsoft", hosts };
  return { status: "other", hosts };
}

/** Add a domain to the ElasticEmail account so it shows up in /domain/list
 *  and can be verified. Idempotent - calling on an existing domain returns
 *  success with no side effects. Without this step our verify endpoint
 *  reads stale "not in account" booleans from /domain/list forever.
 */
export async function addDomain(
  env: Env, domain: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!env.ELASTIC_EMAIL_API_KEY) return { ok: false, error: "ElasticEmail not configured" };
  const params = new URLSearchParams();
  params.set("apikey", env.ELASTIC_EMAIL_API_KEY);
  params.set("domain", domain);
  // Track opens/clicks but don't force a custom tracking-domain requirement -
  // the user is free to skip the tracking CNAME and Elastic falls back.
  params.set("trackingType", "Http");
  const res = await fetch("https://api.elasticemail.com/v2/domain/add", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  // Elastic returns success:false with "Domain exists" when it's already added
  // - treat that as success since we're idempotent.
  if (json?.success) return { ok: true };
  const msg = json?.error || "";
  if (/exists|already/i.test(msg)) return { ok: true };
  return { ok: false, error: msg || "domain/add failed" };
}

/** Remove a domain from the ElasticEmail account. Idempotent - succeeds even
 *  if the domain isn't on the account. Called from /elastic/domain/disconnect
 *  so a user that disconnects no longer occupies a domain slot on our shared
 *  Elastic account. */
export async function removeDomain(
  env: Env, domain: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!env.ELASTIC_EMAIL_API_KEY) return { ok: false, error: "ElasticEmail not configured" };
  const params = new URLSearchParams();
  params.set("apikey", env.ELASTIC_EMAIL_API_KEY);
  params.set("domain", domain);
  const res = await fetch("https://api.elasticemail.com/v2/domain/delete", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (json?.success) return { ok: true };
  const msg = json?.error || "";
  // "Domain doesn't exist" -> already gone, treat as success.
  if (/not.*found|exist|unknown/i.test(msg)) return { ok: true };
  return { ok: false, error: msg || "domain/delete failed" };
}

/** Ask ElasticEmail to re-check ALL DNS records for a domain. Earlier this
 *  only hit /verifyspf which (despite the name) re-checks just SPF on Elastic's
 *  side, leaving DKIM / MX / Tracking / DMARC booleans stuck as `false` in
 *  /domain/list forever. Elastic exposes a dedicated verify endpoint per
 *  record type - call them all in parallel and treat each as best-effort.
 */
export async function verifyDomain(
  env: Env, domain: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!env.ELASTIC_EMAIL_API_KEY) return { ok: false, error: "ElasticEmail not configured" };
  const endpoints = [
    "/v2/domain/verifyspf",
    "/v2/domain/verifydkim",
    "/v2/domain/verifymx",
    "/v2/domain/verifytracking",
    "/v2/domain/verifydmarc",
  ];
  const kick = (path: string): Promise<unknown> => {
    const params = new URLSearchParams();
    params.set("apikey", env.ELASTIC_EMAIL_API_KEY);
    params.set("domain", domain);
    return fetch(`https://api.elasticemail.com${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }).catch(() => null);
  };
  // Promise.allSettled so a 404 on (e.g.) verifytracking - which doesn't
  // exist on every Elastic plan - doesn't abort the others.
  await Promise.allSettled(endpoints.map(kick));
  return { ok: true };
}
