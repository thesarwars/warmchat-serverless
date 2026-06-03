/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { detectMxStatus } from "../../../_shared/elasticEmail.ts";

/**
 * POST /api/elastic/domain/begin-takeover
 * Starts the "WarmChats is my email provider" flow for a domain that has no
 * existing MX record. Issues a fresh single-use TXT token the user must add
 * to their DNS so we can prove ownership without sending an OTP (impossible
 * without a working inbox).
 *
 * Body: { domain, sending_prefix? } - prefix defaults to "hello".
 * Response: { token, txt_host, txt_value, expires_at, mx_status, mx_hosts }
 *
 * Security: token is opaque random entropy bound to (user_id, domain). Re-
 * calling this endpoint rotates the token; the previous one stops verifying.
 * Tokens expire after 7 days and are consumed on the first successful verify.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{ domain?: string; sending_prefix?: string }>(request);
  const domain = (body?.domain || "").trim().toLowerCase();
  const rawPrefix = (body?.sending_prefix || "hello").trim().toLowerCase();
  if (!domain) return error("domain is required", 400);
  // Prefix must be a valid local-part. Letters, digits, dot/dash/underscore.
  // Must start and end with letter or digit (no leading/trailing dots-dashes).
  // No consecutive dots. Max 64 chars per RFC 5321 §4.5.3.1.1.
  if (rawPrefix.length > 64) return error("Sending prefix must be 64 characters or fewer", 400);
  if (rawPrefix.includes("..")) return error("Sending prefix cannot contain consecutive dots", 400);
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(rawPrefix)) {
    return error("Use only letters, numbers, dot, underscore, or hyphen (must start and end with a letter or number)", 400);
  }

  // Refuse takeover if the domain already has an email provider - we'd be
  // hijacking their mail. Only "none" or "elastic" (already us) is allowed.
  const mx = await detectMxStatus(domain);
  if (mx.status !== "none" && mx.status !== "elastic") {
    return error(
      `This domain already has an email provider (${mx.hosts.join(", ")}). ` +
      `Pointing MX to WarmChats would break your existing inbox.`,
      409,
    );
  }

  // 32 bytes of entropy, hex-encoded - 256 bits, safe to expose in DNS.
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + sevenDaysMs).toISOString();

  // Replace any prior unverified row for this (user_id, domain). The UNIQUE
  // constraint enforces one active token per pair.
  await execute(
    env.D1DB,
    `INSERT INTO domain_ownership_verification
       (user_id, domain, sending_prefix, token, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, domain) DO UPDATE SET
        sending_prefix = excluded.sending_prefix,
        token = excluded.token,
        expires_at = excluded.expires_at,
        verified_at = NULL,
        consumed_at = NULL,
        updated_at = excluded.updated_at`,
    user.id, domain, rawPrefix, token, expiresAt, nowIso(), nowIso(),
  );

  return json({
    success: true,
    domain,
    sending_prefix: rawPrefix,
    sending_address: `${rawPrefix}@${domain}`,
    txt_host: "@",
    txt_value: `warmchats-verify=${token}`,
    expires_at: expiresAt,
    mx_status: mx.status,
    mx_hosts: mx.hosts,
  });
};

// Quick GET so the client can re-read the pending token / prefix without
// rotating it (e.g. after a page reload). Returns null if no pending takeover.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const url = new URL(request.url);
  const domain = (url.searchParams.get("domain") || "").trim().toLowerCase();
  if (!domain) return error("domain is required", 400);

  const row = await queryFirst<{
    sending_prefix: string; token: string; expires_at: string;
    verified_at: string | null; consumed_at: string | null;
  }>(
    env.D1DB,
    `SELECT sending_prefix, token, expires_at, verified_at, consumed_at
       FROM domain_ownership_verification
       WHERE user_id = ? AND domain = ?`,
    user.id, domain,
  );
  if (!row) return json({ pending: false });
  return json({
    pending: !row.consumed_at,
    domain,
    sending_prefix: row.sending_prefix,
    sending_address: `${row.sending_prefix}@${domain}`,
    txt_host: "@",
    txt_value: `warmchats-verify=${row.token}`,
    expires_at: row.expires_at,
    verified_at: row.verified_at,
  });
};
