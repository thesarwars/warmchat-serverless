/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { verifyDomain, getDomainRecords, lookupDns, addDomain } from "../../../_shared/elasticEmail.ts";

/**
 * POST /api/elastic/domain/verify - kick a verification check at ElasticEmail
 * AND do a live DNS-over-HTTPS lookup so the UI can show both the expected
 * value and what the user's DNS currently publishes side-by-side. verifyspf
 * just *asks* ElasticEmail to re-check; the actual pass/fail state comes from
 * Elastic's domain/list response (booleans).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{ domain?: string }>(request);
  const domain = (body?.domain || "").trim().toLowerCase();
  if (!domain) return error("domain is required", 400);

  // Safety net: if this domain was registered before /elastic/domain started
  // calling addDomain, /domain/list won't return it. addDomain is idempotent
  // so this is harmless when the domain is already on the account.
  await addDomain(env, domain);
  await verifyDomain(env, domain); // kick the re-check; ignore transient errors

  const recordsResp = await getDomainRecords(env, domain);
  const rec = recordsResp.data;

  const row = await queryFirst<{
    spf_name: string; spf_value: string;
    dkim_name: string; dkim_value: string;
    tracking_name: string; tracking_value: string;
  }>(
    env.D1DB,
    `SELECT spf_name, spf_value, dkim_name, dkim_value, tracking_name, tracking_value
       FROM email_domain WHERE domain = ?`,
    domain,
  );

  // Is this an Option-3 takeover? (WarmChats is the inbound provider.) If so,
  // MX is required; for Option 2 (user has their own inbox elsewhere) MX
  // should stay pointed at their provider, so we don't require it here.
  const ownership = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM domain_ownership_verification
       WHERE user_id = ? AND domain = ? AND verified_at IS NOT NULL`,
    user.id, domain,
  );
  const isTakeoverPath = Boolean(ownership);

  const spfHost      = row?.spf_name      || "@";
  const dkimHost     = row?.dkim_name     || "api._domainkey";
  const trackingHost = row?.tracking_name || `tracking.${domain}`;
  const spfExpected      = row?.spf_value      || rec?.spfValue      || "v=spf1 a mx include:_spf.elasticemail.com ~all";
  const dkimExpected     = row?.dkim_value     || rec?.dkimValue     || "";
  const trackingExpected = row?.tracking_value || rec?.trackingValue || "api.elasticemail.com";

  // Live DNS lookups so the user can see what their DNS currently publishes.
  // SPF lives at the apex (just the domain). DKIM uses the elastic selector.
  // Tracking is a CNAME on the tracking subdomain. MX is at the apex. DMARC
  // lives at _dmarc.<domain> as a TXT starting with "v=DMARC1".
  // `api._domainkey` has an internal dot, so we can't use `includes(".")` to
  // detect "already fully qualified" - check for the actual apex suffix.
  const dkimFqdn = dkimHost.endsWith(`.${domain}`) || dkimHost === domain
    ? dkimHost
    : `${dkimHost}.${domain}`;
  const [spfDetected, dkimDetected, trackingDetected, mxDetected, dmarcDetected] = await Promise.all([
    lookupDns(domain, "TXT"),
    lookupDns(dkimFqdn, "TXT"),
    lookupDns(trackingHost, "CNAME"),
    lookupDns(domain, "MX"),
    lookupDns(`_dmarc.${domain}`, "TXT"),
  ]);
  // Some users end up with multiple v=spf1 TXT records (e.g. a Cloudflare
  // default plus their own). Prefer the one that already includes Elastic's
  // SPF mechanism so we don't lecture a properly-configured user about a
  // stale neighbour record that won't be evaluated anyway. Fall back to the
  // first v=spf1 record otherwise.
  const spfCandidates = spfDetected.filter((v) => v.toLowerCase().startsWith("v=spf1"));
  const pickSpf =
    spfCandidates.find((v) => v.toLowerCase().includes("include:_spf.elasticemail.com")) ||
    spfCandidates[0] ||
    "";
  const pickDkim = dkimDetected.find((v) => v.includes("k=") || v.includes("p=")) || dkimDetected[0] || "";
  const pickTracking = trackingDetected[0] || "";
  // MX lookupDns returns the hostname (priority stripped). Match against the
  // elastic MX target. If there are multiple MX records we still want to flag
  // it as "correct" when one of them is elastic's.
  const pickMx = mxDetected.find((v) => v.includes("elasticemail.com")) || mxDetected[0] || "";
  const pickDmarc = dmarcDetected.find((v) => v.toLowerCase().startsWith("v=dmarc1")) || dmarcDetected[0] || "";

  // record_status is derived from the LIVE DNS lookup (detected vs expected),
  // not from ElasticEmail's domain/list booleans. Those booleans lag reality
  // by 10-30 minutes after the user adds a record, which caused the UI to
  // show "incorrect" alongside a perfectly matching detected value. The DoH
  // result is the authoritative answer for whether the user's DNS is correct;
  // Elastic catches up on its own and the next call will pick up the new
  // booleans for the "sending_ready" gate below.
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const mxExpected    = "mx.elasticemail.com";
  const dmarcHost     = "_dmarc";
  const dmarcExpected = "v=DMARC1; p=none;";

  // SPF: accept ANY valid v=spf1 record that authorizes Elastic (contains
  // `include:_spf.elasticemail.com`), not an exact string match. A domain can
  // have only ONE SPF TXT record, so a domain that already sends via Outlook /
  // Google MUST merge Elastic's include into the existing record - that merged
  // value is correct and is all Elastic needs to send. Exact-match wrongly
  // failed those domains (matches the lenient MX/DMARC checks below).
  const spfMatches      = Boolean(pickSpf && norm(pickSpf).startsWith("v=spf1") && norm(pickSpf).includes("include:_spf.elasticemail.com"));
  const dkimMatches     = Boolean(pickDkim     && dkimExpected && norm(pickDkim)     === norm(dkimExpected));
  const trackingMatches = Boolean(pickTracking && norm(pickTracking) === norm(trackingExpected));
  // MX: just check that elastic's host appears in the resolved list. Strict
  // equality would fail when the user keeps secondary MXes around.
  const mxMatches       = Boolean(pickMx && pickMx.includes("elasticemail.com"));
  // DMARC: any v=DMARC1 policy counts as "present" - we don't require an exact
  // match because plenty of orgs publish stricter policies (p=quarantine etc.)
  // that we shouldn't downgrade.
  const dmarcMatches    = Boolean(pickDmarc && pickDmarc.toLowerCase().startsWith("v=dmarc1"));

  const record_status: Record<string, "verified" | "incorrect"> = {
    spf:      spfMatches      ? "verified" : "incorrect",
    dkim:     dkimMatches     ? "verified" : "incorrect",
    tracking: trackingMatches ? "verified" : "incorrect",
    mx:       mxMatches       ? "verified" : "incorrect",
    dmarc:    dmarcMatches    ? "verified" : "incorrect",
  };

  // sending_records_verified gates the "ready to send" affordances. We require
  // BOTH live DNS to match AND ElasticEmail to confirm - Elastic still has to
  // accept the records on its end before the SMTP send actually works, so we
  // can't just trust DNS here even though the user's records are correct.
  const elasticAcceptedSpf  = Boolean(rec?.spfVerified);
  const elasticAcceptedDkim = Boolean(rec?.dkimVerified);
  const sending_records_verified = spfMatches && dkimMatches && elasticAcceptedSpf && elasticAcceptedDkim;
  // For Option 3 (takeover) the user's MX must point to Elastic so we can
  // receive inbound replies - so MX is required for full verification. For
  // Option 2 the user keeps their own provider's MX, so we only require SPF
  // + DKIM + Tracking + DMARC.
  const all_records_verified = sending_records_verified
    && trackingMatches
    && dmarcMatches
    && (isTakeoverPath ? mxMatches : true);

  // If the user already has a non-Elastic SPF record (e.g. v=spf1 include:_spf.google.com ~all),
  // computing a merge value preserves it while adding Elastic's include. Splicing
  // before the policy mechanism (~all, -all, +all, ?all) is required - SPF stops
  // evaluation at the first `all`, so anything after it is ignored.
  const needsSpfMerge =
    pickSpf && !pickSpf.toLowerCase().includes("include:_spf.elasticemail.com");
  let spf_merge_hint = "";
  if (needsSpfMerge) {
    const allMatch = pickSpf.match(/([~\-+?])all\b/i);
    if (allMatch) {
      const idx = pickSpf.indexOf(allMatch[0]);
      spf_merge_hint = `${pickSpf.slice(0, idx).trimEnd()} include:_spf.elasticemail.com ${pickSpf.slice(idx)}`;
    } else {
      spf_merge_hint = `${pickSpf.trimEnd()} include:_spf.elasticemail.com ~all`;
    }
  }

  const dns_records = [
    { label: "SPF",      type: "TXT",   host: spfHost,      value: spfExpected,      detected: pickSpf,      key: "spf",      required: true  },
    { label: "DKIM",     type: "TXT",   host: dkimHost,     value: dkimExpected,     detected: pickDkim,     key: "dkim",     required: true  },
    // MX required only for Option-3 takeover - Option 2 users keep their
    // existing inbox provider's MX records.
    { label: "MX",       type: "MX",    host: "@",          value: mxExpected,       detected: pickMx,       priority: 10, key: "mx",       required: isTakeoverPath },
    { label: "Tracking", type: "CNAME", host: trackingHost, value: trackingExpected, detected: pickTracking, key: "tracking", required: true },
    { label: "DMARC",    type: "TXT",   host: dmarcHost,    value: dmarcExpected,    detected: pickDmarc,    key: "dmarc",    required: true },
  ];

  // Promote to "fully verified" ONLY when every record passes - sending
  // records alone isn't enough. Earlier we flipped on sending_records_verified,
  // which caused the onboarding UI to claim "Email connected" before MX /
  // Tracking / DMARC were even added.
  if (all_records_verified) {
    await execute(
      env.D1DB,
      `UPDATE email_domain SET status = 'verified', verified_at = ? WHERE domain = ?`,
      nowIso(), domain,
    );
    await execute(
      env.D1DB,
      `UPDATE inbox_connection
          SET status = 'verified', is_verified = 1
          WHERE user_id = ? AND provider = 'elastic'
            AND (email_address LIKE '%@' || ? OR elastic_from_email LIKE '%@' || ?)`,
      user.id, domain, domain,
    );
  }

  return json({
    success: true,
    verified: all_records_verified,
    sending_ready: sending_records_verified,
    sending_records_verified,
    all_records_verified,
    record_status,
    // Surface Elastic's own per-record verification booleans separately so
    // the UI can distinguish "DNS says published" (record_status) from
    // "Elastic accepted it on their end" (elastic_status). When the two
    // disagree, the latter usually just lags by a few minutes.
    elastic_status: {
      spf:      Boolean(rec?.spfVerified),
      dkim:     Boolean(rec?.dkimVerified),
      tracking: Boolean(rec?.trackingVerified),
      mx:       Boolean(rec?.mxVerified),
    },
    dns_records,
    spf_existing: needsSpfMerge ? pickSpf : "",
    spf_merge_hint,
  });
};
