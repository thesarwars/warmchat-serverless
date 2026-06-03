/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { runProcessCallInsights } from "./jobs/processCallInsights.ts";

/**
 * Cron handlers - invoked by the Worker's scheduled() entry. Two triggers:
 *
 *   "* * * * *" (every minute)
 *     Sweep webhook_logs rows in FAILED/RETRYING with next_retry_at <= now.
 *     For each, mark RETRYING + bump retry_count + push next_retry_at out by
 *     the exponential schedule (1m -> 5m -> 30m -> permanent FAILED at retry 4).
 *     We do NOT re-execute the Telnyx call here - we mark the row for a
 *     replay; the actual replay route is the original Pages Function webhook
 *     handler, which is reachable via the public URL with the original
 *     signed body. Simpler: we just bump the row so an operator can manually
 *     trigger the admin retry endpoint, or so the next status-route delivery
 *     of the same event id passes idempotency.
 *
 *   "0 0 * * *" (daily 00:00 UTC)
 *     Close any ACTIVE billing_cycles whose end_date < now, and open the
 *     next cycle for each org (carry the same plan_minute_limit + overage_rate).
 */

const MAX_RETRY = 3;
const BACKOFFS_MS = [60_000, 5 * 60_000, 30 * 60_000]; // 1m, 5m, 30m

/**
 * Run one job with timing + error isolation so a single job's failure never
 * sinks the others, and every tick leaves a `[cron:<job>]` breadcrumb showing
 * how long it took. Mirrors workers/cron/index.ts so both Workers' logs read
 * the same way.
 */
async function runJob(name: string, fn: () => Promise<void>): Promise<void> {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`[cron:${name}] ok in ${Date.now() - t0}ms`);
  } catch (err) {
    console.error(`[cron:${name}] FAILED in ${Date.now() - t0}ms`, err);
  }
}

export async function runScheduled(event: ScheduledEvent, env: Env): Promise<void> {
  const t0 = Date.now();
  console.log(`[cron] tick start trigger=cron "${event.cron}" @ ${new Date(event.scheduledTime).toISOString()}`);

  // Cloudflare gives us the cron string in event.cron; route accordingly.
  if (event.cron === "0 0 * * *") {
    await runJob("billingRollover", () => rolloverBillingCycles(env));
    console.log(`[cron] tick complete in ${Date.now() - t0}ms`);
    return;
  }
  // Default = every-minute jobs. Each is isolated so one failing can't stop
  // the other (the post-call AI pipeline must not break the webhook sweep).
  await runJob("webhookRetries", () => sweepWebhookRetries(env));
  await runJob("callInsights", () => runProcessCallInsights(env));
  console.log(`[cron] tick complete in ${Date.now() - t0}ms`);
}

async function sweepWebhookRetries(env: Env): Promise<void> {
  const now = new Date().toISOString();
  const { results } = await env.D1DB.prepare(
    `SELECT id, retry_count FROM webhook_logs
      WHERE status IN ('FAILED', 'RETRYING')
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY received_at ASC
      LIMIT 100`,
  ).bind(now).all<{ id: string; retry_count: number }>();

  const due = results ?? [];
  if (due.length === 0) {
    console.log("[cron:webhookRetries] no webhook_logs rows due for retry - nothing to do");
    return;
  }
  console.log(`[cron:webhookRetries] ${due.length} row(s) due${due.length === 100 ? " (capped at 100/tick)" : ""}`);

  let retrying = 0, gaveUp = 0;
  for (const row of due) {
    const nextRetry = row.retry_count + 1;
    if (nextRetry > MAX_RETRY) {
      await env.D1DB.prepare(
        `UPDATE webhook_logs SET status = 'FAILED', retry_count = ?, last_retry_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(nextRetry, now, row.id).run();
      gaveUp++;
      console.log(`[cron:webhookRetries] id=${row.id} -> permanently FAILED after ${row.retry_count} retries`);
      continue;
    }
    const delay = BACKOFFS_MS[Math.min(nextRetry - 1, BACKOFFS_MS.length - 1)] ?? 60_000;
    const next = new Date(Date.now() + delay).toISOString();
    await env.D1DB.prepare(
      `UPDATE webhook_logs SET status = 'RETRYING', retry_count = ?, last_retry_at = ?, next_retry_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(nextRetry, now, next, row.id).run();
    retrying++;
    console.log(`[cron:webhookRetries] id=${row.id} -> RETRYING (attempt ${nextRetry}, next at ${next})`);
  }
  console.log(`[cron:webhookRetries] summary: retrying=${retrying} gaveUp=${gaveUp}`);
}

async function rolloverBillingCycles(env: Env): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const { results } = await env.D1DB.prepare(
    `SELECT id, org_id, plan_minute_limit, overage_rate
       FROM billing_cycles
      WHERE status = 'ACTIVE' AND end_date < ?`,
  ).bind(nowIso).all<{ id: string; org_id: number; plan_minute_limit: number; overage_rate: number }>();

  const due = results ?? [];
  if (due.length === 0) {
    console.log("[cron:billingRollover] no ACTIVE cycles past end_date - nothing to do");
    return;
  }
  console.log(`[cron:billingRollover] ${due.length} cycle(s) to roll over`);

  let rolled = 0, skippedExisting = 0;
  for (const row of due) {
    // Close out the old cycle.
    await env.D1DB.prepare(
      `UPDATE billing_cycles SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(row.id).run();

    // Open the next month for this org.
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
    // Don't double-create if a row already exists for this period.
    const existing = await env.D1DB.prepare(
      `SELECT id FROM billing_cycles WHERE org_id = ? AND start_date = ?`,
    ).bind(row.org_id, start.toISOString()).first<{ id: string }>();
    if (existing) {
      skippedExisting++;
      console.log(`[cron:billingRollover] org=${row.org_id} -> closed cycle ${row.id}, next cycle already existed`);
      continue;
    }
    await env.D1DB.prepare(
      `INSERT INTO billing_cycles (id, org_id, start_date, end_date, status, plan_minute_limit, overage_rate)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    ).bind(crypto.randomUUID(), row.org_id, start.toISOString(), end.toISOString(),
           row.plan_minute_limit, row.overage_rate).run();
    rolled++;
    console.log(`[cron:billingRollover] org=${row.org_id} -> closed cycle ${row.id}, opened ${start.toISOString().slice(0, 10)} -> ${end.toISOString().slice(0, 10)}`);
  }
  console.log(`[cron:billingRollover] summary: rolled=${rolled} skippedExisting=${skippedExisting}`);
}
