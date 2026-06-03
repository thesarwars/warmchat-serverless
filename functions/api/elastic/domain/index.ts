/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { getDomainRecords, lookupDns, detectMxStatus, addDomain } from "../../../_shared/elasticEmail.ts";

/**
 * POST /api/elastic/domain - register a sender domain.
 * Looks up DKIM/SPF/tracking records via ElasticEmail, persists into
 * email_domain.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{ domain?: string; org_id?: number }>(request);
  const domain = (body?.domain || "").trim().toLowerCase();
  if (!domain) return error("domain is required", 400);

  const membership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  const orgId = body?.org_id ?? membership?.org_id;
  if (!orgId || !(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  // Register the domain in ElasticEmail (no-op if already there). Without
  // this step /domain/list never returns it, so all of Elastic's per-record
  // booleans stay false forever even with perfect DNS.
  await addDomain(env, domain);

  const recordsResp = await getDomainRecords(env, domain);
  const rec = recordsResp.data;

  await execute(
    env.D1DB,
    `INSERT INTO email_domain
       (org_id, domain, status, spf_name, spf_value, dkim_name, dkim_value,
        tracking_name, tracking_value, bounce_name, bounce_value, created_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(org_id, domain) DO UPDATE SET
        spf_name = excluded.spf_name, spf_value = excluded.spf_value,
        dkim_name = excluded.dkim_name, dkim_value = excluded.dkim_value,
        tracking_name = excluded.tracking_name, tracking_value = excluded.tracking_value`,
    orgId, domain,
    "@", rec?.spfValue || "v=spf1 a mx include:_spf.elasticemail.com ~all",
    rec?.dkimSelector || "api._domainkey", rec?.dkimValue || "",
    rec?.trackingHost || `tracking.${domain}`, rec?.trackingValue || "api.elasticemail.com",
    null, null,
    nowIso(),
  );

  const row = await queryFirst<{
    spf_name: string; spf_value: string;
    dkim_name: string; dkim_value: string;
    tracking_name: string; tracking_value: string;
  }>(
    env.D1DB, `SELECT * FROM email_domain WHERE org_id = ? AND domain = ?`, orgId, domain,
  );

  // Live DNS lookups so the initial records list can show each row's actual
  // detected value next to the expected one (same flow the verify endpoint
  // does on re-check). Cheap - three parallel DoH queries.
  const dkimHost = row?.dkim_name || "api._domainkey";
  const trackingHost = row?.tracking_name || `tracking.${domain}`;
  // `api._domainkey` has an internal dot, so includes(".") would falsely flag
  // it as already-fully-qualified. Check the actual apex suffix instead.
  const dkimFqdn = dkimHost.endsWith(`.${domain}`) || dkimHost === domain
    ? dkimHost
    : `${dkimHost}.${domain}`;
  const [apexTxt, dkimDetected, trackingDetected, mxInfo, dmarcDetected] = await Promise.all([
    lookupDns(domain, "TXT"),
    lookupDns(dkimFqdn, "TXT"),
    lookupDns(trackingHost, "CNAME"),
    detectMxStatus(domain),
    lookupDns(`_dmarc.${domain}`, "TXT"),
  ]);
  // Multiple v=spf1 records can coexist (a stale provider default plus the
  // current one); prefer whichever already includes Elastic so the UI doesn't
  // flag a working setup as needing a merge.
  const spfCandidates = apexTxt.filter((v) => v.toLowerCase().startsWith("v=spf1"));
  const pickSpf =
    spfCandidates.find((v) => v.toLowerCase().includes("include:_spf.elasticemail.com")) ||
    spfCandidates[0] ||
    "";
  const pickDkim = dkimDetected.find((v) => v.includes("k=") || v.includes("p=")) || dkimDetected[0] || "";
  const pickTracking = trackingDetected[0] || "";
  // detectMxStatus returns lowercased hostnames with priority stripped.
  const pickMx = mxInfo.hosts.find((v) => v.includes("elasticemail.com")) || mxInfo.hosts[0] || "";
  const pickDmarc = dmarcDetected.find((v) => v.toLowerCase().startsWith("v=dmarc1")) || dmarcDetected[0] || "";

  // Mirror the verify endpoint: MX is required only for Option-3 takeover.
  const ownership = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM domain_ownership_verification
       WHERE user_id = ? AND domain = ? AND verified_at IS NOT NULL`,
    user.id, domain,
  );
  const isTakeoverPath = Boolean(ownership);

  // BusinessEmailSetup expects an array of {label,type,host,value,detected,key,required}.
  // DKIM is a TXT record (Elastic's "api._domainkey" with k=rsa;p=... value),
  // not a CNAME as the older implementation assumed.
  const dns_records = row ? [
    { label: "SPF",      type: "TXT",   host: row.spf_name,      value: row.spf_value,      detected: pickSpf,      key: "spf",      required: true  },
    { label: "DKIM",     type: "TXT",   host: row.dkim_name,     value: row.dkim_value,     detected: pickDkim,     key: "dkim",     required: true  },
    { label: "MX",       type: "MX",    host: "@",               value: "mx.elasticemail.com", detected: pickMx,    priority: 10, key: "mx", required: isTakeoverPath },
    { label: "Tracking", type: "CNAME", host: row.tracking_name, value: row.tracking_value, detected: pickTracking, key: "tracking", required: true },
    { label: "DMARC",    type: "TXT",   host: "_dmarc",          value: "v=DMARC1; p=none;", detected: pickDmarc,    key: "dmarc",    required: true },
  ] : [];

  // Compute the SPF merge hint from the already-detected apex TXT. SPF stops
  // evaluation at the first `all`, so splice Elastic's include in front of it.
  const needsSpfMerge =
    pickSpf && !pickSpf.toLowerCase().includes("include:_spf.elasticemail.com");
  let spf_merge_hint = "";
  if (needsSpfMerge) {
    const m = pickSpf.match(/([~\-+?])all\b/i);
    if (m) {
      const idx = pickSpf.indexOf(m[0]);
      spf_merge_hint = `${pickSpf.slice(0, idx).trimEnd()} include:_spf.elasticemail.com ${pickSpf.slice(idx)}`;
    } else {
      spf_merge_hint = `${pickSpf.trimEnd()} include:_spf.elasticemail.com ~all`;
    }
  }

  return json({
    success: true,
    domain: row,
    dns_records,
    spf_existing: needsSpfMerge ? pickSpf : "",
    spf_merge_hint,
    mx_status: mxInfo.status,
    mx_hosts: mxInfo.hosts,
  });
};
