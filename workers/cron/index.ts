/// <reference types="@cloudflare/workers-types" />
/**
 * Entry point for the warmchats-cron Worker.
 *
 * Cloudflare Pages Functions cannot register cron triggers, so this is a
 * separate Worker (see ./README.md). It shares the warmchats-db D1 instance
 * via the [[d1_databases]] binding in ./wrangler.toml.
 *
 * Every fire (every 2 min in production) runs all job modules in sequence.
 * `ctx.waitUntil` lets us return immediately while jobs finish - but for now
 * we just await to surface errors in the Cloudflare logs.
 */

import type { CronEnv } from "./env.ts";
import { runSequenceDispatch } from "./jobs/sequenceDispatch.ts";
import { runScheduledMessages } from "./jobs/scheduledMessages.ts";
import { runGmailTokenRefresh } from "./jobs/gmailTokenRefresh.ts";
import { runAppointmentReminders } from "./jobs/appointmentReminders.ts";
import { runEscalationAdvance } from "./jobs/escalationAdvance.ts";
import { runCleanup } from "./jobs/cleanup.ts";
import { runCompExpiry } from "./jobs/compExpiry.ts";

/**
 * Per-job wall-clock budget. On the Workers Paid plan a Cron Trigger invocation
 * gets up to 15 minutes of CPU and no wall-clock cap, so the old 25s ceiling was
 * purely self-imposed - and it was actively harmful: it aborted the scheduled-
 * message dispatcher mid-row, leaving rows stuck in status='sending' with an
 * orphan (empty) conversation that never got retried. The default stays modest
 * for the cheap jobs (a stuck provider fetch shouldn't wedge the tick), but the
 * two queue-draining jobs get a generous budget so they finish their pass.
 */
const JOB_TIMEOUT_MS = 25_000;
/** Queue drainers (scheduled-message + sequence dispatch) - never abort mid-pass. */
const DRAIN_TIMEOUT_MS = 120_000;

/** Reject if `promise` hasn't settled within `ms`. Clears its timer either way. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run one job with a per-job timeout + timing + error isolation so a single
 * job's failure (or hang) never sinks the others, and every tick leaves a
 * `[cron:<job>]` breadcrumb in the logs showing how long it took. Pair with the
 * per-job summary lines (row counts / outcomes) to see at a glance whether a
 * tick actually did anything.
 */
async function runJob(
  name: string, fn: () => Promise<void>, timeoutMs: number = JOB_TIMEOUT_MS,
): Promise<void> {
  const t0 = Date.now();
  try {
    await withTimeout(fn(), timeoutMs, `cron:${name}`);
    console.log(`[cron:${name}] ok in ${Date.now() - t0}ms`);
  } catch (err) {
    console.error(`[cron:${name}] FAILED in ${Date.now() - t0}ms`, err);
  }
}

async function runAllJobs(env: CronEnv, trigger: string): Promise<void> {
  const t0 = Date.now();
  console.log(`[cron] tick start trigger=${trigger}`);
  await Promise.allSettled([
    runJob("sequenceDispatch", () => runSequenceDispatch(env), DRAIN_TIMEOUT_MS),
    runJob("scheduledMessages", () => runScheduledMessages(env), DRAIN_TIMEOUT_MS),
    runJob("gmailTokenRefresh", () => runGmailTokenRefresh(env)),
    runJob("appointmentReminders", () => runAppointmentReminders(env)),
    runJob("escalationAdvance", () => runEscalationAdvance(env)),
    // Retention sweep. Runs every tick - deletes are indexed and a no-match
    // delete is effectively free, so it self-throttles to zero cost when
    // there's nothing old to remove.
    runJob("cleanup", () => runCleanup(env)),
    // Revert lapsed 100%-off comps back to free + alert the owner to add a card.
    runJob("compExpiry", () => runCompExpiry(env)),
  ]);
  console.log(`[cron] tick complete in ${Date.now() - t0}ms`);
}

export default {
  async scheduled(event: ScheduledEvent, env: CronEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runAllJobs(env, `cron "${event.cron}" @ ${new Date(event.scheduledTime).toISOString()}`));
  },

  // Useful for manual triggering during dev (`wrangler dev --test-scheduled`
  // also exposes /__scheduled, but a plain GET makes ad-hoc testing simpler).
  async fetch(req: Request, env: CronEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/run-now") {
      await runAllJobs(env, "manual /run-now");
      return new Response("ok", { status: 200 });
    }
    return new Response("warmchats-cron worker - POST /run-now to fire all jobs", { status: 200 });
  },
};
