/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll, queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { isSiteAdmin } from "../../_shared/adminAccess.ts";

/**
 * GET /api/admin/mock-logs - paginated mock_send_log feed for the caller's
 * org plus a `counts` block (channel/provider/recency totals) so the
 * /admin/debug page only round-trips once per refresh. Owner-only.
 *
 * Query params:
 *   channel=sms|mms|email   (optional filter, applies to both rows + counts)
 *   page=N                  (1-based, default 1)
 *   page_size=50            (1..200, default 50)
 *   since=<ISO timestamp>   (optional)
 *   limit=<1..500>          (older param; ignored when page is set)
 */
interface MockLogRow {
  id: number;
  channel: string;
  direction: string;
  provider: string;
  from_address: string | null;
  to_address: string;
  subject: string | null;
  body: string | null;
  org_id: number | null;
  lead_id: number | null;
  automation_id: number | null;
  rate_acquired: number;
  second_bucket: number | null;
  created_at: string | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  // Site admin only - dev/debug feed across all orgs the admin belongs to,
  // plus global (org_id NULL) auth-flow rows.
  if (!(await isSiteAdmin(env, user.id))) return error("Admin access required", 403);

  const url = new URL(request.url);
  const channel = (url.searchParams.get("channel") || "").trim();
  const since = (url.searchParams.get("since") || "").trim();
  const pageRaw = Number(url.searchParams.get("page") || "1");
  const pageSizeRaw = Number(url.searchParams.get("page_size") || "50");
  const page = Math.max(1, Number.isFinite(pageRaw) ? pageRaw : 1);
  const pageSize = Math.max(1, Math.min(200, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 50));
  const offset = (page - 1) * pageSize;

  // Site admin sees every row across every tenant - no org filter.
  const where: string[] = ["1 = 1"];
  const params: unknown[] = [];
  if (channel === "sms" || channel === "mms" || channel === "email") {
    where.push("m.channel = ?");
    params.push(channel);
  }
  if (since) {
    where.push("m.created_at >= ?");
    params.push(since);
  }
  const whereSql = where.join(" AND ");

  // Page of rows.
  const rows = await queryAll<MockLogRow>(
    env.D1DB,
    `SELECT m.id, m.channel, m.direction, m.provider, m.from_address, m.to_address,
            m.subject, m.body, m.org_id, m.lead_id, m.automation_id,
            m.rate_acquired, m.second_bucket, m.created_at
       FROM mock_send_log m
      WHERE ${whereSql}
      ORDER BY m.id DESC
      LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    offset,
  );

  // Total matching the same filter so the UI can render "Page N of M".
  const totalRow = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM mock_send_log m WHERE ${whereSql}`,
    ...params,
  );
  const total = totalRow?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Counters - one round trip via aggregate query that doesn't apply the
  // channel filter, so the channel pill counters reflect the whole log
  // even while the user has a single-channel filter selected.
  const orgWhere: string[] = ["1 = 1"];
  const orgParams: unknown[] = [];
  if (since) {
    orgWhere.push("m.created_at >= ?");
    orgParams.push(since);
  }
  const orgWhereSql = orgWhere.join(" AND ");

  // Use SQLite datetime() arithmetic for the recency buckets. created_at is
  // stored as UTC text (CURRENT_TIMESTAMP), so `now` is also UTC.
  const aggRow = await queryFirst<{
    total: number;
    sms: number;
    mms: number;
    email: number;
    telnyx: number;
    elastic: number;
    gmail: number;
    last_1m: number;
    last_5m: number;
    last_15m: number;
  }>(
    env.D1DB,
    `SELECT
        COUNT(*)                                                                       AS total,
        SUM(CASE WHEN m.channel  = 'sms'      THEN 1 ELSE 0 END)                       AS sms,
        SUM(CASE WHEN m.channel  = 'mms'      THEN 1 ELSE 0 END)                       AS mms,
        SUM(CASE WHEN m.channel  = 'email'    THEN 1 ELSE 0 END)                       AS email,
        SUM(CASE WHEN m.provider = 'telnyx'   THEN 1 ELSE 0 END)                       AS telnyx,
        SUM(CASE WHEN m.provider = 'elastic'  THEN 1 ELSE 0 END)                       AS elastic,
        SUM(CASE WHEN m.provider = 'gmail'    THEN 1 ELSE 0 END)                       AS gmail,
        SUM(CASE WHEN m.created_at >= datetime('now', '-1 minutes')  THEN 1 ELSE 0 END) AS last_1m,
        SUM(CASE WHEN m.created_at >= datetime('now', '-5 minutes')  THEN 1 ELSE 0 END) AS last_5m,
        SUM(CASE WHEN m.created_at >= datetime('now', '-15 minutes') THEN 1 ELSE 0 END) AS last_15m
      FROM mock_send_log m
     WHERE ${orgWhereSql}`,
    ...orgParams,
  );

  const counts = {
    total: aggRow?.total ?? 0,
    sms: aggRow?.sms ?? 0,
    mms: aggRow?.mms ?? 0,
    email: aggRow?.email ?? 0,
    telnyx: aggRow?.telnyx ?? 0,
    elastic: aggRow?.elastic ?? 0,
    gmail: aggRow?.gmail ?? 0,
    last_1m: aggRow?.last_1m ?? 0,
    last_5m: aggRow?.last_5m ?? 0,
    last_15m: aggRow?.last_15m ?? 0,
  };

  // Per-number breakdown of the last 60 seconds. Telnyx limits are per phone
  // number (49 SMS/sec and 14 MMS/sec PER PHONE), so global per-sec is the
  // wrong metric - we surface peak-per-sec and 60s totals grouped by sender.
  const perNumber = await queryAll<{
    channel: string;
    sender_key: string;
    sent_60s: number;
    peak_per_sec: number;
  }>(
    env.D1DB,
    `SELECT
        m.channel,
        COALESCE(m.from_address, '(unknown)') AS sender_key,
        COUNT(*)                              AS sent_60s,
        (
          SELECT MAX(bucket_count) FROM (
            SELECT COUNT(*) AS bucket_count
              FROM mock_send_log m2
             WHERE m2.channel = m.channel
               AND COALESCE(m2.from_address, '(unknown)') = COALESCE(m.from_address, '(unknown)')
               AND m2.created_at >= datetime('now', '-60 seconds')
            GROUP BY m2.second_bucket
          )
        ) AS peak_per_sec
       FROM mock_send_log m
      WHERE m.created_at >= datetime('now', '-60 seconds')
      GROUP BY m.channel, COALESCE(m.from_address, '(unknown)')
      ORDER BY sent_60s DESC
      LIMIT 50`,
  );

  // What the limiter knows about: live counters from the actual rate-limiter
  // table (these are what the cron consults, so they're the ground truth).
  const rateLimiterNow = await queryAll<{
    channel: string;
    sender_key: string;
    count: number;
    second_bucket: number;
  }>(
    env.D1DB,
    `SELECT channel, sender_key, count, second_bucket
       FROM send_rate_counter
      WHERE second_bucket >= CAST(strftime('%s','now') AS INTEGER) - 60
      ORDER BY second_bucket DESC, count DESC
      LIMIT 100`,
  );

  return json({
    rows,
    page,
    page_size: pageSize,
    total,
    total_pages: totalPages,
    counts,
    per_number: perNumber,
    rate_limiter_recent: rateLimiterNow,
  });
};

/**
 * DELETE /api/admin/mock-logs - wipe the debug feed. Optional `channel`
 * query param narrows the delete to one channel; otherwise everything goes.
 * Site-admin only - this is a debug surface, the data is mocked or
 * locally-staged anyway.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isSiteAdmin(env, user.id))) return error("Admin access required", 403);

  const url = new URL(request.url);
  const channel = (url.searchParams.get("channel") || "").trim();
  if (channel && channel !== "sms" && channel !== "mms" && channel !== "email") {
    return error("channel must be one of sms|mms|email", 400);
  }

  let result;
  if (channel) {
    result = await execute(env.D1DB, `DELETE FROM mock_send_log WHERE channel = ?`, channel);
  } else {
    result = await execute(env.D1DB, `DELETE FROM mock_send_log`);
  }
  return json({ deleted: result.meta?.changes ?? 0 });
};
