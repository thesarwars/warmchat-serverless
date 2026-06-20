/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryFirst, queryAll } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";

/**
 * GET /api/dashboard/org/:orgId/messaging -> Admin ▸ Messaging tab (live).
 * SMS aggregates from `sms_message` (+ `sms_contact` for opt-outs); Email from
 * `inbox_messages` (org-scoped via thread→inbox) + `email_events` for clicks.
 * Metric cards = current calendar month; trend = last 14 days. Single indexed
 * aggregates (free-tier friendly).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  const last14 = (rows: { d: string; n: number }[]) => {
    const m = new Map(rows.map((r) => [r.d, Number(r.n)]));
    const out: number[] = [];
    for (let i = 13; i >= 0; i--) out.push(m.get(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)) ?? 0);
    return out;
  };
  // Median first-response time (seconds): per conversation, the gap from the
  // lead's FIRST inbound this month to the FIRST outbound that follows it.
  // MEDIAN (with a 24h cap) — NOT mean — because the distribution is bimodal:
  // most replies are the sub-minute AI agent, but a few days-later manual /
  // catch-up replies would wreck a plain average. (The old code averaged
  // last-outbound MINUS last-inbound per conversation with no month scope, which
  // measured the gap to a later unrelated campaign blast -> the absurd ~2877 min.
  // Verified on live data: that bug = 2877 min; this median = ~65s.)
  const medianReply = (rows: { sec: number }[]): number | null => {
    const v = rows
      .map((r) => Number(r.sec))
      .filter((s) => s > 0 && s <= 86400) // positive + within 24h (drop catch-up outliers)
      .sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return Math.round(v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2);
  };

  // ---------------------------- SMS ----------------------------------------
  // DELIVERED = carrier-accepted (any outbound NOT 'failed'/'queued'). Telnyx
  // accepts ~96% of sends, but its delivery-receipt (DLR) webhook only flips a
  // small fraction to status='delivered' on the bulk path, so counting strictly
  // status='delivered' reported a bogus ~3% delivery rate for a working campaign.
  // Treating accepted-not-failed as delivered reflects reality until DLR webhook
  // coverage is complete. (Wiring the Telnyx DLR webhook for campaign sends is
  // the upstream fix so 'delivered' can become confirmed-delivered.)
  const sms = await queryFirst<{ sent: number; delivered: number; replies: number }>(
    env.D1DB,
    `SELECT
       SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) AS sent,
       SUM(CASE WHEN direction='outbound' AND status NOT IN ('failed','queued') THEN 1 ELSE 0 END) AS delivered,
       SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END) AS replies
     FROM sms_message
     WHERE org_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m','now')`, orgId);
  const smsTypes = await queryFirst<{ ai: number; automation: number; manual: number }>(
    env.D1DB,
    `SELECT
       SUM(CASE WHEN sent_by_ai=1 AND automation_id IS NULL THEN 1 ELSE 0 END) AS ai,
       SUM(CASE WHEN automation_id IS NOT NULL THEN 1 ELSE 0 END) AS automation,
       SUM(CASE WHEN sent_by_ai=0 AND automation_id IS NULL THEN 1 ELSE 0 END) AS manual
     FROM sms_message
     WHERE org_id = ? AND direction='outbound' AND strftime('%Y-%m', created_at) = strftime('%Y-%m','now')`, orgId);
  const smsOptOut = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM sms_contact
      WHERE org_id = ? AND opted_out = 1 AND strftime('%Y-%m', opted_out_at) = strftime('%Y-%m','now')`, orgId);
  const smsChartRows = await queryAll<{ d: string; n: number }>(
    env.D1DB,
    `SELECT date(created_at) AS d, COUNT(*) AS n FROM sms_message
      WHERE org_id = ? AND direction='outbound' AND date(created_at) >= date('now','-13 days')
      GROUP BY date(created_at)`, orgId);
  // First-response times: per conversation, the lead's FIRST inbound this month
  // -> the FIRST outbound that follows it, in seconds. (Replaces the old
  // last-inbound/last-outbound pairing that produced the bogus ~2877 min.)
  const smsReplyRows = await queryAll<{ sec: number }>(
    env.D1DB,
    `WITH first_in AS (
       SELECT conversation_id AS k, MIN(created_at) AS t_in
         FROM sms_message
        WHERE org_id = ? AND direction='inbound'
          AND strftime('%Y-%m', created_at) = strftime('%Y-%m','now')
        GROUP BY conversation_id
     )
     SELECT (julianday(MIN(o.created_at)) - julianday(fi.t_in)) * 86400.0 AS sec
       FROM first_in fi
       JOIN sms_message o
         ON o.conversation_id = fi.k AND o.org_id = ?
        AND o.direction='outbound' AND o.created_at > fi.t_in
      GROUP BY fi.k`, orgId, orgId);

  const smsSent = Number(sms?.sent ?? 0);

  // ---------------------------- EMAIL --------------------------------------
  // Outbound volume + pixel opens live on inbox_messages (org-scoped via
  // thread->inbox). Delivery OUTCOMES (bounced / failed / clicked + provider
  // opens) are only reliably populated in `email_events` by the ElasticEmail
  // notifications webhook (/api/webhooks/elastic). The webhook that writes
  // inbox_messages.delivery_status/bounced_at (/api/elastic/status) is a
  // *separate* ElasticEmail URL and only one notifications URL can be
  // configured - so reading outcomes off inbox_messages silently reports 0
  // bounces / ~100% delivered. We source outcomes from email_events instead
  // (joined to lead by recipient email, the same key the rest of the app
  // trusts) so the KPIs stay correct regardless of which webhook is wired up.
  const EMAIL_FROM = `FROM inbox_messages im
       JOIN thread t ON im.thread_id = t.id
       JOIN inbox i ON t.inbox_id = i.id`;
  const email = await queryFirst<{ sent: number; opened: number }>(
    env.D1DB,
    `SELECT
       COUNT(*) AS sent,
       SUM(CASE WHEN im.opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened
     ${EMAIL_FROM}
     WHERE i.org_id = ? AND im.direction='outbound' AND im.channel='email'
       AND strftime('%Y-%m', COALESCE(im.message_date, im.created_at)) = strftime('%Y-%m','now')`, orgId);
  const emailTypes = await queryFirst<{ ai: number; automation: number; manual: number }>(
    env.D1DB,
    `SELECT
       SUM(CASE WHEN im.sent_by_ai=1 AND im.automation_id IS NULL THEN 1 ELSE 0 END) AS ai,
       SUM(CASE WHEN im.automation_id IS NOT NULL THEN 1 ELSE 0 END) AS automation,
       SUM(CASE WHEN im.sent_by_ai=0 AND im.automation_id IS NULL THEN 1 ELSE 0 END) AS manual
     ${EMAIL_FROM}
     WHERE i.org_id = ? AND im.direction='outbound' AND im.channel='email' AND strftime('%Y-%m', COALESCE(im.message_date, im.created_at)) = strftime('%Y-%m','now')`, orgId);
  const emailChartRows = await queryAll<{ d: string; n: number }>(
    env.D1DB,
    `SELECT date(COALESCE(im.message_date, im.created_at)) AS d, COUNT(*) AS n
     ${EMAIL_FROM}
     WHERE i.org_id = ? AND im.direction='outbound' AND im.channel='email' AND date(COALESCE(im.message_date, im.created_at)) >= date('now','-13 days')
     GROUP BY d`, orgId);
  // Engagement outcomes from provider events, counted as UNIQUE recipients per
  // outcome (raw COUNT(*) double-counts repeat opens/clicks and can push a
  // "rate" past 100%).
  const emailEng = await queryFirst<{ opened: number; clicked: number; bounced: number; failed: number }>(
    env.D1DB,
    `SELECT
       COUNT(DISTINCT CASE WHEN ee.event_type='opened'  THEN LOWER(ee.to_email) END) AS opened,
       COUNT(DISTINCT CASE WHEN ee.event_type='clicked' THEN LOWER(ee.to_email) END) AS clicked,
       COUNT(DISTINCT CASE WHEN ee.event_type='bounced' THEN LOWER(ee.to_email) END) AS bounced,
       COUNT(DISTINCT CASE WHEN ee.event_type IN ('error','abuse') THEN LOWER(ee.to_email) END) AS failed
     FROM email_events ee JOIN lead l ON LOWER(l.email) = LOWER(ee.to_email)
     WHERE l.org_id = ? AND strftime('%Y-%m', COALESCE(ee.occurred_at, ee.created_at)) = strftime('%Y-%m','now')`, orgId);

  const emSent = Number(email?.sent ?? 0);
  const emBounced = Math.min(emSent, Number(emailEng?.bounced ?? 0));
  const emFailed = Math.min(emSent, Number(emailEng?.failed ?? 0));
  const emDelivered = Math.max(0, emSent - emBounced - emFailed);
  // Opens: tracking pixel (inbox_messages.opened_at) OR a provider 'opened'
  // event - take whichever recorded more so a blocked pixel or an unconfigured
  // status webhook doesn't zero the metric. Both capped at sent.
  const emOpened = Math.min(emSent, Math.max(Number(email?.opened ?? 0), Number(emailEng?.opened ?? 0)));
  const emClicked = Math.min(emSent, Number(emailEng?.clicked ?? 0));

  return json({
    sms: {
      sent: smsSent,
      delivered: Number(sms?.delivered ?? 0),
      delivered_pct: pct(Number(sms?.delivered ?? 0), smsSent),
      replies: Number(sms?.replies ?? 0),
      reply_rate: pct(Number(sms?.replies ?? 0), smsSent),
      avg_reply_seconds: medianReply(smsReplyRows),
      opt_outs: Number(smsOptOut?.n ?? 0),
      opt_out_pct: pct(Number(smsOptOut?.n ?? 0), smsSent),
      chart: last14(smsChartRows),
      types: [
        { label: "AI auto-reply", value: Number(smsTypes?.ai ?? 0) },
        { label: "Follow-up sequence", value: Number(smsTypes?.automation ?? 0) },
        { label: "Manual / 1-on-1", value: Number(smsTypes?.manual ?? 0) },
      ],
    },
    email: {
      sent: emSent,
      delivered: emDelivered,
      delivered_pct: pct(emDelivered, emSent),
      open_rate: pct(emOpened, emSent),
      opened: emOpened,
      click_rate: pct(emClicked, emSent),
      clicked: emClicked,
      bounces: emBounced,
      bounce_pct: pct(emBounced, emSent),
      chart: last14(emailChartRows),
      types: [
        { label: "AI follow-up", value: Number(emailTypes?.ai ?? 0) },
        { label: "Campaign / automation", value: Number(emailTypes?.automation ?? 0) },
        { label: "Manual / 1-on-1", value: Number(emailTypes?.manual ?? 0) },
      ],
    },
    last_updated: new Date().toISOString(),
  });
};
