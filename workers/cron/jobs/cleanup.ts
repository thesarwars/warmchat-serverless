/// <reference types="@cloudflare/workers-types" />
/**
 * Retention / cleanup sweep.
 *
 * Prunes OPERATIONAL rows that are safe to lose once they're old: rate-limit
 * buckets, the mock-send debug log, processed webhook receipts, stale
 * notifications, AI activity history, and terminal-state scheduled messages.
 *
 * Deliberately NEVER touches compliance or business records:
 *   - consent / opt-out (sms_contact, lead.sms_opt_out)  -> TCPA proof, keep 4y+
 *   - conversation content (sms_message, inbox_messages)  -> proof of what we sent
 *   - billing (usage, usage_records)
 *   - in-flight rows (scheduled_message status scheduled/sending,
 *     webhook_logs status RECEIVED/PROCESSING/RETRYING)
 *
 * Each prune is isolated (a failure on one table never blocks the others) and
 * logs how many rows it removed. Retention windows are the constants below -
 * bump a number to keep things longer. Comparisons use datetime() so the mix of
 * ISO ("...T...Z") and CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS") values both
 * parse; an unparseable value yields NULL and is left untouched (fail safe).
 */
import type { CronEnv } from "../env.ts";

/** Retention windows in days. Raise to keep data longer. */
const RETENTION_DAYS = {
  sendRateCounter: 2,
  mockSendLog: 14,
  webhookLogs: 30,
  notificationRead: 90,
  notificationAny: 180,
  aiActivityLog: 180,
  scheduledMessage: 180,
} as const;

/** Run one DELETE in isolation; log + return the row count, swallow errors. */
async function purge(
  env: CronEnv, label: string, sql: string, ...binds: unknown[]
): Promise<number> {
  try {
    const r = await env.D1DB.prepare(sql).bind(...binds).run();
    const n = Number(r.meta?.changes ?? 0);
    if (n > 0) console.log(`[cron:cleanup] ${label}: deleted ${n}`);
    return n;
  } catch (err) {
    console.error(`[cron:cleanup] ${label} failed`, err);
    return 0;
  }
}

export async function runCleanup(env: CronEnv): Promise<void> {
  let total = 0;

  // Per-second rate buckets - only the live second is ever read.
  total += await purge(
    env, "send_rate_counter",
    `DELETE FROM send_rate_counter WHERE datetime(created_at) < datetime('now', ?)`,
    `-${RETENTION_DAYS.sendRateCounter} days`,
  );

  // Local dev/debug send log.
  total += await purge(
    env, "mock_send_log",
    `DELETE FROM mock_send_log WHERE datetime(created_at) < datetime('now', ?)`,
    `-${RETENTION_DAYS.mockSendLog} days`,
  );

  // Webhook receipts - only PROCESSED/FAILED are done; keep anything still in flight.
  total += await purge(
    env, "webhook_logs",
    `DELETE FROM webhook_logs
       WHERE status IN ('PROCESSED', 'FAILED')
         AND datetime(received_at) < datetime('now', ?)`,
    `-${RETENTION_DAYS.webhookLogs} days`,
  );

  // Notifications - read ones go sooner, everything stale eventually.
  total += await purge(
    env, "notification (read)",
    `DELETE FROM notification WHERE is_read = 1 AND datetime(created_at) < datetime('now', ?)`,
    `-${RETENTION_DAYS.notificationRead} days`,
  );
  total += await purge(
    env, "notification (stale)",
    `DELETE FROM notification WHERE datetime(created_at) < datetime('now', ?)`,
    `-${RETENTION_DAYS.notificationAny} days`,
  );

  // AI activity feed history.
  total += await purge(
    env, "ai_activity_log",
    `DELETE FROM ai_activity_log WHERE datetime(created_at) < datetime('now', ?)`,
    `-${RETENTION_DAYS.aiActivityLog} days`,
  );

  // Scheduled messages that already finished - the real copy lives in
  // sms_message / inbox_messages. NEVER delete still-pending/sending rows.
  total += await purge(
    env, "scheduled_message",
    `DELETE FROM scheduled_message
       WHERE status IN ('sent', 'failed', 'cancelled', 'skipped')
         AND datetime(updated_at) < datetime('now', ?)`,
    `-${RETENTION_DAYS.scheduledMessage} days`,
  );

  if (total === 0) {
    console.log("[cron:cleanup] nothing to prune");
  } else {
    console.log(`[cron:cleanup] summary: pruned ${total} row(s)`);
  }
}
