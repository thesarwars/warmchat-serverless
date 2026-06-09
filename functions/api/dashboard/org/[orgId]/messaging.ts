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
  // Avg first-ish response time: per conversation, last-inbound -> last-outbound
  // (the same heuristic the dashboard uses for email threads), in seconds.
  const avgReply = (ins: { k: number; t: string }[], outs: { k: number; t: string }[]) => {
    const outMap = new Map(outs.map((o) => [o.k, o.t]));
    const deltas: number[] = [];
    for (const i of ins) {
      const o = outMap.get(i.k);
      if (!o) continue;
      const d = (new Date(o).getTime() - new Date(i.t).getTime()) / 1000;
      if (d > 0) deltas.push(d);
    }
    return deltas.length ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;
  };

  // ---------------------------- SMS ----------------------------------------
  const sms = await queryFirst<{ sent: number; delivered: number; replies: number }>(
    env.D1DB,
    `SELECT
       SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) AS sent,
       SUM(CASE WHEN direction='outbound' AND status='delivered' THEN 1 ELSE 0 END) AS delivered,
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
  const smsIns = await queryAll<{ k: number; t: string }>(
    env.D1DB,
    `SELECT conversation_id AS k, MAX(created_at) AS t FROM sms_message
      WHERE org_id = ? AND direction='inbound' GROUP BY conversation_id`, orgId);
  const smsOuts = await queryAll<{ k: number; t: string }>(
    env.D1DB,
    `SELECT conversation_id AS k, MAX(created_at) AS t FROM sms_message
      WHERE org_id = ? AND direction='outbound' GROUP BY conversation_id`, orgId);

  const smsSent = Number(sms?.sent ?? 0);

  // ---------------------------- EMAIL --------------------------------------
  const EMAIL_FROM = `FROM inbox_messages im
       JOIN thread t ON im.thread_id = t.id
       JOIN inbox i ON t.inbox_id = i.id`;
  const email = await queryFirst<{ sent: number; bounced: number; failed: number; opened: number }>(
    env.D1DB,
    `SELECT
       SUM(CASE WHEN im.direction='outbound' THEN 1 ELSE 0 END) AS sent,
       SUM(CASE WHEN im.direction='outbound' AND (im.bounced_at IS NOT NULL OR im.delivery_status='bounced') THEN 1 ELSE 0 END) AS bounced,
       SUM(CASE WHEN im.direction='outbound' AND im.delivery_status='failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN im.direction='outbound' AND im.opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened
     ${EMAIL_FROM}
     WHERE i.org_id = ? AND strftime('%Y-%m', COALESCE(im.message_date, im.created_at)) = strftime('%Y-%m','now')`, orgId);
  const emailTypes = await queryFirst<{ ai: number; automation: number; manual: number }>(
    env.D1DB,
    `SELECT
       SUM(CASE WHEN im.sent_by_ai=1 AND im.automation_id IS NULL THEN 1 ELSE 0 END) AS ai,
       SUM(CASE WHEN im.automation_id IS NOT NULL THEN 1 ELSE 0 END) AS automation,
       SUM(CASE WHEN im.sent_by_ai=0 AND im.automation_id IS NULL THEN 1 ELSE 0 END) AS manual
     ${EMAIL_FROM}
     WHERE i.org_id = ? AND im.direction='outbound' AND strftime('%Y-%m', COALESCE(im.message_date, im.created_at)) = strftime('%Y-%m','now')`, orgId);
  const emailChartRows = await queryAll<{ d: string; n: number }>(
    env.D1DB,
    `SELECT date(COALESCE(im.message_date, im.created_at)) AS d, COUNT(*) AS n
     ${EMAIL_FROM}
     WHERE i.org_id = ? AND im.direction='outbound' AND date(COALESCE(im.message_date, im.created_at)) >= date('now','-13 days')
     GROUP BY d`, orgId);
  const emailClicks = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM email_events ee JOIN lead l ON LOWER(l.email) = LOWER(ee.to_email)
      WHERE l.org_id = ? AND ee.event_type = 'clicked'
        AND strftime('%Y-%m', COALESCE(ee.occurred_at, ee.created_at)) = strftime('%Y-%m','now')`, orgId);

  const emSent = Number(email?.sent ?? 0);
  const emBounced = Number(email?.bounced ?? 0);
  const emFailed = Number(email?.failed ?? 0);
  const emDelivered = Math.max(0, emSent - emBounced - emFailed);
  const emOpened = Number(email?.opened ?? 0);
  const emClicked = Number(emailClicks?.n ?? 0);

  return json({
    sms: {
      sent: smsSent,
      delivered: Number(sms?.delivered ?? 0),
      delivered_pct: pct(Number(sms?.delivered ?? 0), smsSent),
      replies: Number(sms?.replies ?? 0),
      reply_rate: pct(Number(sms?.replies ?? 0), smsSent),
      avg_reply_seconds: avgReply(smsIns, smsOuts),
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
