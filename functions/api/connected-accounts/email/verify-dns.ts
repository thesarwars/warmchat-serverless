/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { verifyDomain, addDomain, lookupDns } from "../../../_shared/elasticEmail.ts";

/**
 * POST /api/connected-accounts/email/verify-dns
 *
 * Wraps the existing /api/elastic/domain/verify behavior into a card-facing
 * shape (overall/spf/dkim/sending_ready/reply_ready) using our serverless
 * verify pipeline.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<{ domain?: string; email?: string }>(request)) ?? {};
  let domainEmail = ((body.domain || body.email || "") as string).trim().toLowerCase();

  if (!domainEmail) {
    const inbox = await queryFirst<{ email_address: string | null }>(
      env.D1DB,
      `SELECT email_address FROM inbox_connection
        WHERE user_id = ? AND provider = 'elastic' ORDER BY id DESC LIMIT 1`,
      user.id,
    );
    domainEmail = (inbox?.email_address || "").trim().toLowerCase();
  }
  if (!domainEmail || !domainEmail.includes("@")) {
    return error("A valid domain email is required", 400);
  }
  const domain = domainEmail.split("@", 2)[1] || "";
  if (!domain) return error("A valid domain email is required", 400);

  // Make sure Elastic knows the domain, then kick a re-verify.
  await addDomain(env, domain);
  try {
    await verifyDomain(env, domain);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Verify failed", 400);
  }

  // Live DNS check on the records we have stored. SPF at apex TXT, DKIM at
  // api._domainkey by default. If we don't have a stored record we report
  // "pending" instead of failing.
  const stored = await queryFirst<{
    spf_value: string | null; dkim_name: string | null; dkim_value: string | null;
  }>(
    env.D1DB,
    `SELECT spf_value, dkim_name, dkim_value FROM email_domain WHERE domain = ? LIMIT 1`,
    domain,
  );
  const dkimHost = stored?.dkim_name || "api._domainkey";
  const dkimFqdn = dkimHost.endsWith(`.${domain}`) || dkimHost === domain
    ? dkimHost
    : `${dkimHost}.${domain}`;
  const [apexTxt, dkimTxt] = await Promise.all([
    lookupDns(domain, "TXT"),
    lookupDns(dkimFqdn, "TXT"),
  ]);
  const spfPresent = stored?.spf_value
    ? apexTxt.some((v) => v.replace(/\s+/g, "") === (stored.spf_value || "").replace(/\s+/g, ""))
    : apexTxt.some((v) => v.toLowerCase().startsWith("v=spf1"));
  const dkimPresent = stored?.dkim_value
    ? dkimTxt.some((v) => v.includes(stored.dkim_value as string))
    : dkimTxt.length > 0;

  const spf = spfPresent ? "verified" : "pending";
  const dkim = dkimPresent ? "verified" : "pending";
  const sendingReady = spfPresent && dkimPresent;
  const overall = sendingReady ? "verified" : "pending";

  if (sendingReady) {
    await execute(
      env.D1DB,
      `UPDATE inbox_connection SET is_verified = 1, status = 'verified'
        WHERE user_id = ? AND provider = 'elastic'`,
      user.id,
    );
  }

  return json({
    ok: true,
    dns: {
      overall,
      spf,
      dkim,
      sending_ready: sendingReady,
      reply_ready: sendingReady,
    },
  });
};
