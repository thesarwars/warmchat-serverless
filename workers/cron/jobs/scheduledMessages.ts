/// <reference types="@cloudflare/workers-types" />
/**
 * Scheduled message dispatcher.
 *
 * Polls `scheduled_message` every minute, acquires a per-second slot via
 * `tryAcquireSlot` (D1 backed), then dispatches through the mock-aware
 * provider helpers. Rows that fail to acquire a slot are left at
 * status='scheduled' so the next tick retries them. Rows blocked by quiet
 * hours are also deferred without state change.
 *
 * At actual dispatch time (NOT at queue time), the corresponding
 * `sms_message` / `inbox_messages` row is inserted so the conversation /
 * thread view reflects what the recipient actually saw.
 */
import type { CronEnv } from "../env.ts";
import { checkQuietHours } from "../_shared/quietHours.ts";
import {
  tryAcquireSlot,
  DEFAULT_RATE_LIMITS,
  currentSecondBucket,
  type SendChannel,
} from "../_shared/sendRateLimiter.ts";
import { isMockSendsEnabled } from "../_shared/appSettings.ts";
import { isAiMasterEnabled, isAgentEnabled } from "../_shared/aiGate.ts";
import { checkAiSmsPace } from "../_shared/aiSendPace.ts";
import { appendCanSpamFooter, makeUnsubscribeToken, unsubscribeUrl } from "../_shared/emailCompliance.ts";
import { notify } from "../_shared/notify.ts";

interface DueRow {
  id: number;
  channel: "email" | "sms";
  to_address: string;
  subject: string | null;
  body: string | null;
  attachments_json: string | null;
  user_id: number;
  org_id: number;
  contact_id: number | null;
  automation_id: number | null;
  automation_status: string | null;
  lead_name: string | null;
  lead_first_name: string | null;
  lead_timezone: string | null;
  lead_opt_out: number | null;
  lead_email_opt_out: number | null;
  lead_sms_consent_status: string | null;
  sender_name: string | null;
  sender_business_address: string | null;
  sent_by_ai: number | null;
}

// Cap rows per tick. Each row sends via ONE provider fetch() (Telnyx/ElasticEmail),
// and each fetch() is a SUBREQUEST. A single Worker invocation has a hard subrequest
// ceiling - 50 on the free plan, 1000 on paid - and ALL cron jobs in this tick
// (sequenceDispatch + scheduledMessages + gmail/escalation) share that one budget.
// So the COMBINED drainer total per tick must stay well under 50: this drainer is
// capped at 20 and sequenceDispatch at 15, leaving ~15 headroom for the other jobs.
// 20/tick x 1 tick/min = ~1200/hr of capacity, far above the hourly send caps, so
// the hourly limiter (not this) remains the real send-rate governor.
//
// PRODUCTION/PAID toggle: on Workers Paid the subrequest cap is 1000, so restore
// the high-throughput value below (kept for the live production server's heavier
// user load). The 100 overran the FREE 50-subrequest limit and stranded hundreds
// of rows as 'failed' ("Too many subrequests by single Worker invocation").
// const MAX_PER_TICK = 20;         // FREE tier (50-subrequest/invocation cap)
const MAX_PER_TICK = 100;           // PAID / production (1000-subrequest cap) - ACTIVE since 2026-06-21 upgrade
const PROCESS_CONCURRENCY = 12;
// Rows left in status='sending' by a crashed / timed-out previous tick are
// stranded forever (the due query only selects 'scheduled'). Reclaim any that
// have sat in 'sending' longer than this back to 'scheduled' so the next pass
// retries them. MUST exceed DRAIN_TIMEOUT_MS (120s in index.ts): if it's shorter
// than the max pass duration, a still-running pass's in-flight 'sending' rows get
// reclaimed and re-dispatched by the next pass -> duplicate send. 180s leaves a
// 60s margin over the 120s drain budget.
const STUCK_SENDING_GRACE_SECONDS = 180;

/**
 * Is a send error TRANSIENT (leave the row 'scheduled' to retry next tick) vs a
 * PERMANENT rejection of this specific message (mark 'failed', terminal)?
 * Retryable: the free-tier subrequest overrun, network/timeout throws, provider
 * 429 (rate limited) and 5xx (provider server error) - all clear on a later tick.
 * Terminal: 4xx other than 429 (bad number, auth, validation), unknown channel.
 * A bare thrown Error with no HTTP code is infra (subrequest/runtime) -> retry.
 */
function isRetryableSendError(msg: string | null | undefined): boolean {
  const s = String(msg || "").toLowerCase();
  if (!s) return false;
  if (s.includes("too many subrequests")) return true;
  if (s.includes("network") || s.includes("timeout") || s.includes("timed out") ||
      s.includes("connection") || s.includes("fetch failed") || s.includes("socket")) return true;
  const m = s.match(/http\s+(\d{3})/);
  if (m) { const code = Number(m[1]); return code === 429 || code >= 500; }
  // Thrown Error (String(err) -> "Error: ...") with no HTTP code = transient infra.
  if (s.startsWith("error:")) return true;
  return false;
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]!; // guarded by the while condition
      await fn(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Surface a send outcome in the AI Activity feed + the per-agent Logs tab.
 * For anything other than a clean send we lead the `detail` with the REASON
 * (e.g. "Telnyx not configured", "Lead opted out of SMS") so the UI shows WHY
 * a message did not go out, not just the message text. automation rows ->
 * outbound agent; bare qualification sends -> inbound agent.
 */
async function logSendActivity(
  env: CronEnv,
  row: DueRow,
  opts: { event: string; status: "ok" | "warn" | "error"; reason?: string | null },
): Promise<void> {
  if (!row.contact_id) return;
  try {
    const agentKey = row.automation_id ? "outbound" : "inbound";
    const leadLabel = (row.lead_name || row.lead_first_name || "").trim() || null;
    const bodyPreview = (row.body || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const detail = opts.reason
      ? `${opts.reason}${bodyPreview ? ` - "${bodyPreview}"` : ""}`.slice(0, 300)
      : bodyPreview.slice(0, 200);
    await env.D1DB.prepare(
      `INSERT INTO ai_activity_log (org_id, user_id, agent_key, event, lead_id, lead_label, detail, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(row.org_id, row.user_id, agentKey, opts.event, row.contact_id, leadLabel, detail, opts.status).run();
  } catch (e) { console.warn("[cron:scheduledMessages] activity log failed", e); }
}

export async function runScheduledMessages(env: CronEnv): Promise<void> {
  // 0) Reclaim rows a previous tick left mid-flight. A crash / timeout between
  // "set status='sending'" and the final status write strands the row forever
  // (the due query only matches 'scheduled') AND can leave an orphan, empty
  // conversation behind. Flip stale 'sending' rows back so they retry; the
  // persist helpers are idempotent on the contact/conversation, so the retry
  // fills the conversation that was created but left empty.
  try {
    // (a) Rows already DISPATCHED (sent_message_id set) but stuck in 'sending'
    // because the pass died before the final status write: these were sent, so
    // finalize them as 'sent'. Re-scheduling them would re-dispatch -> duplicate.
    await env.D1DB.prepare(
      `UPDATE scheduled_message
          SET status = 'sent', sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE status = 'sending' AND sent_message_id IS NOT NULL
          AND updated_at <= datetime('now', ?)`,
    ).bind(`-${STUCK_SENDING_GRACE_SECONDS} seconds`).run();
    // (b) Rows NOT yet confirmed dispatched (sent_message_id NULL): safe to retry.
    const reclaimed = await env.D1DB.prepare(
      `UPDATE scheduled_message
          SET status = 'scheduled', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'sending' AND sent_message_id IS NULL
          AND updated_at <= datetime('now', ?)`,
    ).bind(`-${STUCK_SENDING_GRACE_SECONDS} seconds`).run();
    const n = Number((reclaimed.meta as { changes?: number } | undefined)?.changes ?? 0);
    if (n > 0) console.log(`[cron:scheduledMessages] reclaimed ${n} stuck 'sending' row(s)`);
  } catch (e) { console.warn("[cron:scheduledMessages] reclaim failed", e); }

  const now = new Date().toISOString();
  const { results } = await env.D1DB.prepare(
    `SELECT sm.id, sm.channel, sm.to_address, sm.subject, sm.body, sm.attachments_json,
            sm.user_id, sm.org_id, sm.contact_id, sm.automation_id,
            a.status         AS automation_status,
            l.name           AS lead_name,
            l.first_name     AS lead_first_name,
            l.timezone       AS lead_timezone,
            l.sms_opt_out          AS lead_opt_out,
            l.email_opt_out        AS lead_email_opt_out,
            l.sms_consent_status   AS lead_sms_consent_status,
            u.name           AS sender_name,
            u.business_address AS sender_business_address,
            sm.sent_by_ai    AS sent_by_ai
       FROM scheduled_message sm
       LEFT JOIN lead l ON l.id = sm.contact_id
       LEFT JOIN "user" u ON u.id = sm.user_id
       LEFT JOIN automation a ON a.id = sm.automation_id
      WHERE sm.status = 'scheduled' AND sm.scheduled_at <= ?
      -- Skip rows of a PAUSED automation in the QUERY, not just in processRow.
      -- Otherwise paused rows (often the oldest scheduled_at) sort first and eat
      -- the whole MAX_PER_TICK budget every tick, starving live/Running sends -
      -- the tick burns on rows it will only skip. They stay 'scheduled' and flow
      -- again the moment the automation is resumed. (processRow keeps the pause
      -- check as a defensive backstop against a status change mid-tick.)
      AND (sm.automation_id IS NULL OR COALESCE(a.status, '') <> 'Paused')
      -- Inbound AI replies (reactive, no automation_id) are conversational and
      -- time-sensitive: a lead is waiting on the other end. Drain them BEFORE
      -- outbound automation drips so a large queued campaign can never starve a
      -- live reply. Within each group, oldest-scheduled first.
      ORDER BY CASE WHEN sm.automation_id IS NULL THEN 0 ELSE 1 END ASC,
               sm.scheduled_at ASC
      LIMIT ?`,
  ).bind(now, MAX_PER_TICK).all<DueRow>();

  const due = results ?? [];
  if (due.length === 0) {
    console.log("[cron:scheduledMessages] no due messages - nothing to do");
    return;
  }
  console.log(`[cron:scheduledMessages] ${due.length} due message(s)${due.length === MAX_PER_TICK ? ` (capped at ${MAX_PER_TICK}/tick)` : ""}`);

  // Pre-resolve every per-org / per-agent / per-(org,timezone) / per-sender
  // lookup ONCE, in parallel, up front. The old code resolved these lazily
  // inside a sequential loop, so each row paid for its own round-trips in
  // series - the dominant cost. Resolving the small set of distinct keys first
  // means the concurrent send phase below hits in-memory maps, not D1.
  const masterCache = new Map<number, boolean>();
  const agentCache = new Map<string, boolean>();
  const quietCache = new Map<string, Awaited<ReturnType<typeof checkQuietHours>>>();
  const senderCache = new Map<string, string>();
  const agentKeyFor = (row: DueRow): "inbound" | "outbound" => (row.automation_id ? "outbound" : "inbound");

  const uniqueOrgs = [...new Set(due.map((r) => r.org_id))];
  const uniqueAgents = [...new Map(due.map((r) => [`${r.org_id}:${r.user_id}:${agentKeyFor(r)}`, r])).values()];
  const uniqueQuiet = [...new Map(due.map((r) => [`${r.org_id}:${r.lead_timezone ?? ""}`, r])).values()];
  const uniqueSenders = [...new Map(due.map((r) => [`${r.channel}:${r.user_id}`, r])).values()];

  await Promise.all([
    ...uniqueOrgs.map(async (orgId) => { masterCache.set(orgId, await isAiMasterEnabled(env, orgId)); }),
    ...uniqueAgents.map(async (r) => {
      const key = agentKeyFor(r);
      agentCache.set(`${r.org_id}:${r.user_id}:${key}`, await isAgentEnabled(env, r.org_id, r.user_id, key));
    }),
    ...uniqueQuiet.map(async (r) => {
      quietCache.set(`${r.org_id}:${r.lead_timezone ?? ""}`, await checkQuietHours(env, r.org_id, r.lead_timezone));
    }),
    ...uniqueSenders.map(async (r) => {
      senderCache.set(`${r.channel}:${r.user_id}`, await resolveSenderKey(env, r));
    }),
  ]);

  let sent = 0, failed = 0, skippedQuiet = 0, cancelledOptOut = 0, rateLimited = 0, errored = 0, skippedPaused = 0, skippedAiOff = 0, pacedDeferred = 0, retried = 0;

  const processRow = async (row: DueRow): Promise<void> => {
    try {
      // Card-level pause: if this drip belongs to an automation that's paused
      // (e.g. its Outbound AI workflow card was switched off), hold the row in
      // 'scheduled' so resuming the automation/card re-flows it next tick.
      if (row.automation_id && row.automation_status === "Paused") {
        skippedPaused++;
        return;
      }

      // AI control gate (kill-switch). Outbound drips (automation rows) require
      // the global master AND the Outbound agent on; inbound AI replies (no
      // automation) require the master AND the Inbound agent on. Either off ->
      // HOLD the row in 'scheduled' so it resumes when the switch is turned back
      // on (never sent or cancelled here). Fail closed: AI is off by default.
      const agentKey = agentKeyFor(row);
      if (!masterCache.get(row.org_id) || !agentCache.get(`${row.org_id}:${row.user_id}:${agentKey}`)) {
        skippedAiOff++;
        return;
      }

      // Skip-this-tick quiet-hours guard. Leave the row in 'scheduled' so the
      // next tick picks it up once the local window opens.
      const quiet = quietCache.get(`${row.org_id}:${row.lead_timezone ?? ""}`);
      if (quiet?.blocked) {
        skippedQuiet++;
        return;
      }

      // TCPA: never send to a lead that's opted out OR flagged "Do not SMS"
      // by the agent (the import wizard + add-lead modal expose this as the
      // "Do not SMS" choice). Both reasons cancel the row so the cron stops
      // re-polling it.
      if (
        row.channel === "sms" &&
        ((row.lead_opt_out ?? 0) === 1 || row.lead_sms_consent_status === "no_sms")
      ) {
        const reason = row.lead_sms_consent_status === "no_sms"
          ? "Lead flagged Do not SMS"
          : "Lead opted out of SMS";
        await env.D1DB.prepare(
          `UPDATE scheduled_message SET status = 'cancelled', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(reason, row.id).run();
        cancelledOptOut++;
        await logSendActivity(env, row, { event: "message.skipped", status: "warn", reason });
        console.log(`[cron:scheduledMessages] msg=${row.id} sms -> cancelled (${reason})`);
        return;
      }
      // CAN-SPAM: same hard-block for email when the lead unsubscribed.
      if (row.channel === "email" && (row.lead_email_opt_out ?? 0) === 1) {
        await env.D1DB.prepare(
          `UPDATE scheduled_message SET status = 'cancelled', error_message = 'lead opted out of email', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(row.id).run();
        cancelledOptOut++;
        await logSendActivity(env, row, { event: "message.skipped", status: "warn", reason: "Lead opted out of email" });
        console.log(`[cron:scheduledMessages] msg=${row.id} email -> cancelled (lead opted out)`);
        return;
      }
      // Marketing email sends (those with an associated lead + automation) MUST
      // carry the agent's physical postal address. Without it the send is not
      // CAN-SPAM compliant, so we cancel rather than ship a non-compliant mail.
      if (row.channel === "email" && row.automation_id && !((row.sender_business_address || "").trim())) {
        await env.D1DB.prepare(
          `UPDATE scheduled_message SET status = 'failed', error_message = 'Sender business address required for marketing email (set in Account settings)', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(row.id).run();
        failed++;
        await logSendActivity(env, row, { event: "message.failed", status: "error", reason: "Sender business address required for marketing email (set in Account settings)" });
        console.log(`[cron:scheduledMessages] msg=${row.id} email -> failed (missing sender business_address)`);
        return;
      }

      // Per-number pacing for AI SMS: never burst AI texts to one handset
      // (carrier 40002 spam filter). Over-paced rows are deferred - we bump
      // scheduled_at to the next allowed time and leave them 'scheduled', so a
      // later tick sends them once the number cools down. Never dropped.
      if (row.channel === "sms" && row.sent_by_ai === 1) {
        const pace = await checkAiSmsPace(env.D1DB, row.org_id, row.to_address);
        if (!pace.ok && pace.nextAtIso) {
          await env.D1DB.prepare(
            `UPDATE scheduled_message SET scheduled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          ).bind(pace.nextAtIso, row.id).run();
          pacedDeferred++;
          return;
        }
      }

      // Sender key for the rate limiter (resolved up front). SMS keys on the
      // agent's 10DLC number; email keys on the sending domain.
      const senderKey = senderCache.get(`${row.channel}:${row.user_id}`) ?? "shared";
      const channel: SendChannel = row.channel === "email" ? "email" : "sms";

      const acquired = await tryAcquireSlot(env, channel, senderKey, DEFAULT_RATE_LIMITS);
      if (!acquired) {
        // Cap hit for this second - leave 'scheduled' and try again next tick.
        rateLimited++;
        return;
      }

      // ATOMIC CLAIM. Flip 'scheduled' -> 'sending' ONLY if it's still
      // 'scheduled', and dispatch only if WE won the flip (changes === 1).
      // The old unconditional `WHERE id = ?` let two overlapping passes (a tick
      // that overran 60s into the next tick, or a reclaim racing a still-running
      // pass) both dispatch the same row -> duplicate send. The status guard
      // makes the claim exclusive, so each row is sent by exactly one drainer.
      const claim = await env.D1DB.prepare(
        `UPDATE scheduled_message SET status = 'sending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'scheduled'`,
      ).bind(row.id).run();
      if (Number((claim.meta as { changes?: number } | undefined)?.changes ?? 0) !== 1) {
        // Lost the race - another pass already claimed/sent this row. Skip.
        return;
      }

      let ok = false;
      let errMsg: string | null = null;
      let providerMessageId: string | null = null;
      if (row.channel === "email") {
        const r = await dispatchEmail(env, row);
        ok = r.ok; errMsg = r.ok ? null : r.error; providerMessageId = r.id ?? null;
      } else if (row.channel === "sms") {
        const r = await dispatchSms(env, row, senderKey);
        ok = r.ok; errMsg = r.ok ? null : r.error; providerMessageId = r.id ?? null;
      } else {
        errMsg = `Unknown channel ${row.channel}`;
      }

      if (ok) {
        // IDEMPOTENCY MARKER. Record that this row was dispatched BEFORE the
        // (slower) persist + final status write. If the pass dies after the
        // provider accepted the send but before status='sent', the reclaim sees
        // sent_message_id and finalizes the row as 'sent' instead of re-sending
        // it -> no duplicate. Without this marker the reclaim re-dispatched
        // crash-stranded rows (the residual dupes seen at 20k scale).
        try {
          await env.D1DB.prepare(`UPDATE scheduled_message SET sent_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(providerMessageId ?? "sent", row.id).run();
        } catch { /* non-fatal; final update below also sets it */ }
        // Materialize the inbox / SMS row so the conversation view shows it.
        // Failures here are logged but do not flip the scheduled_message
        // status back - the provider already accepted the send.
        try {
          if (row.channel === "email") {
            await persistOutboundEmail(env, row, providerMessageId);
          } else {
            await persistOutboundSms(env, row, providerMessageId);
          }
        } catch (e) {
          console.error("persist outbound failed", row.id, e);
        }
      }

      // Transient provider failures (429 / 5xx) go back to 'scheduled' to retry
      // next tick instead of being dropped as terminal 'failed'. Only a permanent
      // rejection (4xx, bad config) stays 'failed'. (sent_at / sent_message_id
      // are only set on success, so a retried row stays clean for the next pass.)
      const finalStatus = ok ? "sent" : (isRetryableSendError(errMsg) ? "scheduled" : "failed");
      await env.D1DB.prepare(
        `UPDATE scheduled_message
           SET status = ?, error_message = ?, sent_at = ?, sent_message_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).bind(finalStatus, errMsg, ok ? new Date().toISOString() : null, ok ? providerMessageId : null, row.id).run();
      if (ok) sent++; else if (finalStatus === "scheduled") retried++; else failed++;
      console.log(`[cron:scheduledMessages] msg=${row.id} ${row.channel} -> ${ok ? "sent" : finalStatus === "scheduled" ? `retry (${errMsg})` : `failed (${errMsg})`}`);

      // Surface the send in the AI Activity feed + per-agent Logs. A transient
      // retry is NOT a failure, so don't log it as one (avoids false "failed"
      // entries in the feed for rows that will send on the next tick).
      if (ok || finalStatus === "failed") {
        await logSendActivity(env, row, {
          event: ok ? "message.sent" : "message.failed",
          status: ok ? "ok" : "error",
          reason: ok ? null : (errMsg || "Send failed"),
        });
      }

      // "AI replied" notification for AI conversational replies that were queued
      // with a natural delay (sent_by_ai=1, no automation). The interactive path
      // notifies inside the orchestrator; once the reply is deferred to the cron,
      // the cron must fire it instead - otherwise natural-delay replies never
      // notify. Automation drips (sent_by_ai=0) are intentionally excluded.
      if (ok && row.sent_by_ai === 1 && !row.automation_id && row.contact_id) {
        const leadLabel = (row.lead_name || row.lead_first_name || "").trim() || "a lead";
        try {
          await notify(env, {
            userId: row.user_id,
            orgId: row.org_id,
            kind: "ai_reply_sent",
            channel: row.channel === "email" ? "email" : "sms",
            contactId: row.contact_id,
            severity: "info",
            title: `AI replied to ${leadLabel}`,
            body: (row.body || "").slice(0, 240),
            data: { path: `/inbox?lead=${row.contact_id}`, lead_id: row.contact_id, lead_name: row.lead_name ?? null, ai: true },
          });
        } catch (e) { console.warn("[cron:scheduledMessages] ai_reply_sent notify failed", e); }
      }

      // AI Follow-Up status transition: when the last queued follow-up for a
      // lead finishes without ever getting a reply, mark them Not Engaged so
      // the agent knows automation has paused.
      if (ok && row.contact_id) {
        const pending = await env.D1DB.prepare(
          `SELECT COUNT(1) AS c FROM scheduled_message
            WHERE contact_id = ? AND status = 'scheduled'`,
        ).bind(row.contact_id).first<{ c: number }>();
        const lead = await env.D1DB.prepare(
          `SELECT last_reply_at, status, qualification_status FROM lead WHERE id = ?`,
        ).bind(row.contact_id).first<{ last_reply_at: string | null; status: string | null; qualification_status: string | null }>();
        if ((pending?.c ?? 0) === 0 && lead && !lead.last_reply_at) {
          await env.D1DB.prepare(
            `UPDATE lead SET status = 'Not Engaged',
                             qualification_status = 'Not Engaged',
                             intent = COALESCE(intent, 'cold'),
                             updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
          ).bind(row.contact_id).run();
        }
      }
    } catch (err) {
      // A THROWN send error is the free-tier "Too many subrequests" overrun (or a
      // network/runtime throw) - transient infra, NOT a permanent rejection of this
      // message. Leave it 'scheduled' so the next (lighter) tick retries it instead
      // of permanently dropping the recipient. This (plus the lower MAX_PER_TICK) is
      // the fix for the hundreds of rows that were stranded as 'failed'.
      const retry = isRetryableSendError(String(err));
      await env.D1DB.prepare(
        `UPDATE scheduled_message SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(retry ? "scheduled" : "failed", String(err).slice(0, 300), row.id).run();
      if (retry) {
        retried++;
        console.warn(`[cron:scheduledMessages] msg=${row.id} deferred (transient): ${String(err).slice(0, 120)}`);
      } else {
        errored++;
        await logSendActivity(env, row, { event: "message.failed", status: "error", reason: String(err).slice(0, 200) });
        console.error(`[cron:scheduledMessages] msg=${row.id} errored`, err);
      }
    }
  };

  // Send concurrently (bounded). D1/provider waits overlap instead of stacking,
  // so the tick drains in roughly one round-trip x ceil(rows / concurrency)
  // rather than the serial sum - the only way the queue can approach the
  // per-second provider caps. Counter writes are safe: the event loop is
  // single-threaded, so `sent++` etc. never interleave.
  await mapPool(due, PROCESS_CONCURRENCY, processRow);

  console.log(`[cron:scheduledMessages] summary: sent=${sent} failed=${failed} retried=${retried} skippedQuiet=${skippedQuiet} skippedPaused=${skippedPaused} skippedAiOff=${skippedAiOff} cancelledOptOut=${cancelledOptOut} rateLimited=${rateLimited} pacedDeferred=${pacedDeferred} errored=${errored}`);
}

/** Look up the 10DLC phone (SMS) or sending domain (email) for rate keying. */
async function resolveSenderKey(env: CronEnv, row: DueRow): Promise<string> {
  if (row.channel === "sms") {
    const u = await env.D1DB.prepare(
      `SELECT telnyx_phone_number FROM "user" WHERE id = ?`,
    ).bind(row.user_id).first<{ telnyx_phone_number: string | null }>();
    return (u?.telnyx_phone_number || "shared").trim() || "shared";
  }
  // Email: prefer the user's verified business sending address; fall back to
  // the shared ElasticEmail sender. Group by domain so a busy account that
  // burns through its slot doesn't block other accounts.
  const conn = await env.D1DB.prepare(
    `SELECT email_address, elastic_from_email
       FROM inbox_connection
      WHERE user_id = ? AND provider = 'elastic'
      ORDER BY id DESC LIMIT 1`,
  ).bind(row.user_id).first<{ email_address: string | null; elastic_from_email: string | null }>();
  const from = (conn?.elastic_from_email || conn?.email_address || env.ELASTIC_SENDER_EMAIL || "").trim();
  const at = from.indexOf("@");
  return at >= 0 ? from.slice(at + 1).toLowerCase() : "shared";
}

interface SendOk { ok: true; id: string | null }
interface SendErr { ok: false; error: string; id: null }
type SendResult = SendOk | SendErr;

/**
 * Resolve the user's verified business sender + the inbound reply-to. Queued
 * emails (AI natural-delay replies, quiet-hours, retries) MUST send identically
 * to the live inbox path: from the agent's verified address with replies routed
 * to inbound+{connectionId}@REPLY_DOMAIN. The old hardcoded
 * env.ELASTIC_SENDER_EMAIL made every AI reply come from the platform address
 * with no Reply-To, so lead replies went to the apex mailbox and never reached
 * the WarmChats inbox.
 */
async function resolveEmailSender(env: CronEnv, userId: number): Promise<{ fromEmail: string; replyTo: string | null }> {
  const conn = await env.D1DB.prepare(
    `SELECT id, email_address, elastic_from_email
       FROM inbox_connection
      WHERE user_id = ? AND provider = 'elastic'
        AND (status IS NULL OR status IN ('verified', 'active'))
      ORDER BY id DESC LIMIT 1`,
  ).bind(userId).first<{ id: number; email_address: string | null; elastic_from_email: string | null }>();
  const fromEmail = (conn?.elastic_from_email || conn?.email_address || "").trim();
  const replyDomain = (env.REPLY_DOMAIN || "mail.warmchats.com").trim();
  return {
    fromEmail: fromEmail || env.ELASTIC_SENDER_EMAIL,
    replyTo: conn ? `inbound+${conn.id}@${replyDomain}` : null,
  };
}

async function dispatchEmail(env: CronEnv, row: DueRow): Promise<SendResult> {
  // CAN-SPAM footer: only marketing-shaped sends (those linked to an automation +
  // an identifiable lead) get the agent's address + signed unsubscribe link.
  // The check for business_address presence happens upstream in the main loop,
  // so by this point sender_business_address is guaranteed for automation rows.
  let bodyHtml = row.body || "";
  let listUnsubHeader: string | null = null;
  if (row.automation_id && row.contact_id && row.sender_business_address) {
    const token = await makeUnsubscribeToken(row.contact_id, env.EMAIL_UNSUB_SIGNING_KEY);
    const url = unsubscribeUrl(row.contact_id, token, env.PUBLIC_BASE_URL);
    bodyHtml = appendCanSpamFooter(bodyHtml, {
      businessAddress: row.sender_business_address,
      unsubscribeUrl: url,
      senderName: row.sender_name ?? null,
    });
    // RFC 8058 one-click unsubscribe so Gmail/Yahoo show a native unsubscribe
    // button next to the sender name. The token in the URL gates the action.
    listUnsubHeader = `<${url}>`;
  }

  const sender = await resolveEmailSender(env, row.user_id);

  if (await isMockSendsEnabled(env, row.org_id ?? null)) {
    await env.D1DB.prepare(
      `INSERT INTO mock_send_log
         (channel, provider, from_address, to_address, subject, body, org_id, lead_id, automation_id, rate_acquired, second_bucket)
       VALUES ('email', 'elastic', ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).bind(
      sender.fromEmail || null,
      row.to_address,
      row.subject ?? null,
      bodyHtml ?? null,
      row.org_id ?? null,
      row.contact_id ?? null,
      row.automation_id ?? null,
      currentSecondBucket(),
    ).run();
    return { ok: true, id: `mock-${Date.now()}` };
  }
  if (!env.ELASTIC_EMAIL_API_KEY) return { ok: false, error: "ElasticEmail not configured", id: null };
  const params = new URLSearchParams();
  params.set("apikey", env.ELASTIC_EMAIL_API_KEY);
  params.set("subject", row.subject || "(no subject)");
  params.set("from", sender.fromEmail);
  params.set("fromName", row.sender_name || env.ELASTIC_SENDER_NAME);
  if (sender.replyTo) params.set("replyTo", sender.replyTo);
  params.set("to", row.to_address);
  params.set("bodyHtml", bodyHtml);
  // Marketing rows (with a footer) explicitly aren't transactional - leaving
  // this flag off lets carriers process the unsubscribe properly.
  if (!listUnsubHeader) params.set("isTransactional", "true");
  if (listUnsubHeader) {
    params.set("headers_listunsubscribe", listUnsubHeader);
    params.set("headers_listunsubscribepost", "List-Unsubscribe=One-Click");
  }
  const res = await fetch("https://api.elasticemail.com/v2/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (res.ok) {
    const j = await res.json().catch(() => null) as { data?: { messageid?: string } } | null;
    return { ok: true, id: j?.data?.messageid ?? null };
  }
  return { ok: false, error: `HTTP ${res.status}`, id: null };
}

async function dispatchSms(env: CronEnv, row: DueRow, senderKey: string): Promise<SendResult> {
  if (await isMockSendsEnabled(env, row.org_id ?? null)) {
    await env.D1DB.prepare(
      `INSERT INTO mock_send_log
         (channel, provider, from_address, to_address, subject, body, org_id, lead_id, automation_id, rate_acquired, second_bucket)
       VALUES ('sms', 'telnyx', ?, ?, NULL, ?, ?, ?, ?, 1, ?)`,
    ).bind(
      senderKey || null,
      row.to_address,
      row.body ?? null,
      row.org_id ?? null,
      row.contact_id ?? null,
      row.automation_id ?? null,
      currentSecondBucket(),
    ).run();
    return { ok: true, id: `mock-${Date.now()}` };
  }
  if (!env.TELNYX_API_KEY) return { ok: false, error: "Telnyx not configured", id: null };
  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: senderKey, to: row.to_address, text: row.body || "" }),
  });
  if (res.ok) {
    const j = await res.json().catch(() => null) as { data?: { id?: string } } | null;
    return { ok: true, id: j?.data?.id ?? null };
  }
  return { ok: false, error: `HTTP ${res.status}`, id: null };
}

async function persistOutboundSms(
  env: CronEnv, row: DueRow, providerMessageId: string | null,
): Promise<void> {
  if (!row.org_id) return;
  let contact = await env.D1DB.prepare(
    `SELECT id FROM sms_contact WHERE org_id = ? AND phone_number_e164 = ? LIMIT 1`,
  ).bind(row.org_id, row.to_address).first<{ id: number }>();
  if (!contact) {
    const ins = await env.D1DB.prepare(
      `INSERT INTO sms_contact (org_id, phone_number_e164) VALUES (?, ?)`,
    ).bind(row.org_id, row.to_address).run();
    contact = { id: Number(ins.meta.last_row_id) };
  }
  let conv = await env.D1DB.prepare(
    `SELECT id FROM sms_conversation WHERE org_id = ? AND contact_id = ? LIMIT 1`,
  ).bind(row.org_id, contact.id).first<{ id: number }>();
  if (!conv) {
    const ins = await env.D1DB.prepare(
      `INSERT INTO sms_conversation (org_id, contact_id, last_message_at) VALUES (?, ?, ?)`,
    ).bind(row.org_id, contact.id, new Date().toISOString()).run();
    conv = { id: Number(ins.meta.last_row_id) };
  }
  await env.D1DB.prepare(
    `INSERT INTO sms_message
       (org_id, conversation_id, direction, body, status, provider_message_sid, created_at, is_read, sent_by_ai, automation_id)
     VALUES (?, ?, 'outbound', ?, 'sent', ?, ?, 1, ?, ?)`,
  ).bind(row.org_id, conv.id, row.body || "", providerMessageId, new Date().toISOString(), row.sent_by_ai ? 1 : 0, row.automation_id ?? null).run();
  await env.D1DB.prepare(
    `UPDATE sms_conversation SET last_message_at = ? WHERE id = ?`,
  ).bind(new Date().toISOString(), conv.id).run();
}

async function persistOutboundEmail(
  env: CronEnv, row: DueRow, providerMessageId: string | null,
): Promise<void> {
  if (!row.org_id) return;
  let inbox = await env.D1DB.prepare(
    `SELECT id FROM inbox WHERE org_id = ? AND channel = 'email' LIMIT 1`,
  ).bind(row.org_id).first<{ id: number }>();
  if (!inbox) {
    const ins = await env.D1DB.prepare(
      `INSERT INTO inbox (name, channel, org_id, created_at) VALUES ('Email', 'email', ?, ?)`,
    ).bind(row.org_id, new Date().toISOString()).run();
    inbox = { id: Number(ins.meta.last_row_id) };
  }
  let threadId: number | null;
  if (row.automation_id) {
    const c = await env.D1DB.prepare(
      `SELECT thread_id FROM automation WHERE id = ?`,
    ).bind(row.automation_id).first<{ thread_id: number | null }>();
    threadId = c?.thread_id ?? null;
    if (!threadId) {
      const t = await env.D1DB.prepare(
        `INSERT INTO thread (subject, inbox_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      ).bind(row.subject || "(no subject)", inbox.id, new Date().toISOString(), new Date().toISOString()).run();
      threadId = Number(t.meta.last_row_id);
      await env.D1DB.prepare(`UPDATE automation SET thread_id = ? WHERE id = ?`)
        .bind(threadId, row.automation_id).run();
    }
  } else {
    const t = await env.D1DB.prepare(
      `INSERT INTO thread (subject, inbox_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).bind(row.subject || "(no subject)", inbox.id, new Date().toISOString(), new Date().toISOString()).run();
    threadId = Number(t.meta.last_row_id) || null;
  }
  if (!threadId) return;
  await env.D1DB.prepare(
    `INSERT INTO inbox_messages
       (thread_id, sender_id, subject, body, direction, channel, to_email, created_at, message_date, is_read, delivery_status, sent_at, message_id, sent_by_ai, automation_id)
     VALUES (?, ?, ?, ?, 'outbound', 'email', ?, ?, ?, 1, 'sent', ?, ?, ?, ?)`,
  ).bind(
    threadId, row.user_id, row.subject || "(no subject)", row.body || "",
    row.to_address, new Date().toISOString(), new Date().toISOString(),
    new Date().toISOString(), providerMessageId, row.sent_by_ai ? 1 : 0, row.automation_id ?? null,
  ).run();
  if (row.contact_id) {
    await env.D1DB.prepare(
      `INSERT INTO thread_lead_assignments (thread_id, lead_id, assigned_at) VALUES (?, ?, ?)`,
    ).bind(threadId, row.contact_id, new Date().toISOString()).run();
  }
}
