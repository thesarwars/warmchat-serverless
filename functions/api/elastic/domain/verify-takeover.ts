/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { lookupDns, addInboundRoute } from "../../../_shared/elasticEmail.ts";

/**
 * POST /api/elastic/domain/verify-takeover
 * Completes the MX-takeover flow: the user has added the warmchats-verify=...
 * TXT record we issued via begin-takeover, and we now DoH-lookup it to prove
 * ownership. On match (token correct, not expired, not already consumed) we:
 *   - mark the row consumed_at = now (single-use, so leaving the TXT in DNS
 *     can't be used to hijack a different user's account later),
 *   - create/refresh an inbox_connection row pointing at <prefix>@<domain>,
 *   - register an inbound route on ElasticEmail so replies hit our webhook,
 *   - upsert email_domain so the standard SPF/DKIM/MX records get persisted.
 *
 * Body: { domain }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{ domain?: string }>(request);
  const domain = (body?.domain || "").trim().toLowerCase();
  if (!domain) return error("domain is required", 400);

  const row = await queryFirst<{
    id: number; sending_prefix: string; token: string;
    expires_at: string; verified_at: string | null; consumed_at: string | null;
  }>(
    env.D1DB,
    `SELECT id, sending_prefix, token, expires_at, verified_at, consumed_at
       FROM domain_ownership_verification
       WHERE user_id = ? AND domain = ?`,
    user.id, domain,
  );
  if (!row) return error("No pending takeover for this domain. Call begin-takeover first.", 404);

  if (row.consumed_at) {
    return error("Verification token already used. Start over from begin-takeover.", 410);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return error("Verification token expired. Start over from begin-takeover.", 410);
  }

  const expectedValue = `warmchats-verify=${row.token}`;
  const detected = await lookupDns(domain, "TXT");
  const matched = detected.some((v) => v.trim() === expectedValue);
  if (!matched) {
    return json({
      success: false,
      verified: false,
      message: "TXT record not found yet. DNS can take 5-30 minutes to propagate.",
      expected: { host: "@", value: expectedValue },
      detected,
    }, 200);
  }

  const now = nowIso();
  await execute(
    env.D1DB,
    `UPDATE domain_ownership_verification
        SET verified_at = ?, consumed_at = ?, updated_at = ?
        WHERE id = ?`,
    now, now, now, row.id,
  );

  // Find the user's org to attach the domain row.
  const membership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (!membership) return error("User has no organization", 400);

  const sendingAddress = `${row.sending_prefix}@${domain}`;

  // Upsert the inbox_connection so the user can immediately send/receive at
  // this address. is_verified=0 until the actual SPF/DKIM/MX DNS records pass
  // (separate from ownership proof) - the next step in the UI.
  await execute(
    env.D1DB,
    `INSERT INTO inbox_connection
       (user_id, email_address, elastic_from_email, provider, can_receive,
        is_verified, status, elastic_email_inbound_route_added)
     VALUES (?, ?, ?, 'elastic', 1, 0, 'ownership_verified', 0)`,
    user.id, sendingAddress, sendingAddress,
  );

  // Upsert the email_domain row so verify.ts has something to report against.
  await execute(
    env.D1DB,
    `INSERT INTO email_domain
       (org_id, domain, status, spf_name, spf_value, dkim_name, dkim_value,
        tracking_name, tracking_value, created_at)
     VALUES (?, ?, 'pending', '@', 'v=spf1 a mx include:_spf.elasticemail.com ~all',
             'api._domainkey', '', ?, 'api.elasticemail.com', ?)
     ON CONFLICT(org_id, domain) DO NOTHING`,
    membership.org_id, domain, `tracking.${domain}`, now,
  );

  // Set up the inbound route so replies hit /api/elastic/inbound. Best-effort:
  // failures here don't block ownership verification - the user can retry from
  // the DNS-records step once Elastic accepts the domain.
  const inboundUrl = env.ELASTIC_WEBHOOK_URL || `${env.PUBLIC_BASE_URL || ""}/api/elastic/inbound`;
  await addInboundRoute(env, domain, inboundUrl).catch(() => null);

  return json({
    success: true,
    verified: true,
    domain,
    sending_address: sendingAddress,
    next: "Add the MX, SPF, and DKIM records shown next, then click Verify.",
    mx_records: [
      { host: "@", priority: 10, value: "mx.elasticemail.com" },
    ],
  });
};
