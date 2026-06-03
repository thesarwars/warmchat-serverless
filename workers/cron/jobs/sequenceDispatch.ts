/// <reference types="@cloudflare/workers-types" />
/**
 * Sequence dispatcher
 *
 * Polls `step_executions` for rows whose `scheduled_at` is in the past, sends
 * them via the right channel client (ElasticEmail for `email`, Telnyx for
 * `sms`), and flips status. Throttle: 200 rows per tick to stay inside the
 * Workers CPU budget; the next 2-minute tick picks up the rest.
 */
import type { CronEnv } from "../env.ts";
import {
  checkUsageLimit,
  incrementUsage,
  getOrgPlan,
} from "../_shared/usageCounter.ts";
import { notifyQuotaExceeded } from "../_shared/quotaNotify.ts";
import { checkQuietHours } from "../_shared/quietHours.ts";
import { isMockSendsEnabled } from "../_shared/appSettings.ts";
import { isAiMasterEnabled, isAgentEnabled } from "../_shared/aiGate.ts";
import { currentSecondBucket } from "../_shared/sendRateLimiter.ts";
import { appendCanSpamFooter, makeUnsubscribeToken, unsubscribeUrl } from "../_shared/emailCompliance.ts";
import { appendComplianceFooter } from "../_shared/smsCompliance.ts";

interface DueRow {
  exec_id: string;
  instance_id: string;
  step_number: number;
  channel: "email" | "sms";
  subject: string | null;
  message_template: string;
  lead_contact: string;
  extra_data: string | null;
  org_id: number | null;
  user_id: number | null;
  lead_id: number | null;
  lead_timezone: string | null;
  lead_email_opt_out: number | null;
  lead_sms_consent_status: string | null;
  sender_name: string | null;
  sender_business_address: string | null;
}

const MAX_PER_TICK = 200;

export async function runSequenceDispatch(env: CronEnv): Promise<void> {
  const now = new Date().toISOString();
  const { results } = await env.D1DB.prepare(
    `SELECT e.id AS exec_id, e.instance_id, e.step_number,
            s.channel, s.subject, s.message_template,
            i.lead_contact, i.extra_data, i.org_id, i.user_id,
            CAST(i.lead_id AS INTEGER) AS lead_id,
            l.timezone          AS lead_timezone,
            l.email_opt_out     AS lead_email_opt_out,
            l.sms_consent_status AS lead_sms_consent_status,
            u.name              AS sender_name,
            u.business_address  AS sender_business_address
       FROM step_executions e
       JOIN sequence_steps s ON s.id = e.step_id
       JOIN sequence_instances i ON i.id = e.instance_id
       LEFT JOIN lead l ON l.id = CAST(i.lead_id AS INTEGER)
       LEFT JOIN "user" u ON u.id = i.user_id
      WHERE e.status = 'scheduled'
        AND e.scheduled_at <= ?
        AND i.status = 'active'
      ORDER BY e.scheduled_at ASC
      LIMIT ?`,
  ).bind(now, MAX_PER_TICK).all<DueRow>();

  const due = results ?? [];
  if (due.length === 0) {
    console.log("[cron:sequenceDispatch] no due steps - nothing to do");
    return;
  }
  console.log(`[cron:sequenceDispatch] ${due.length} due step(s)${due.length === MAX_PER_TICK ? ` (capped at ${MAX_PER_TICK}/tick)` : ""}`);

  let sent = 0, failed = 0, skippedQuiet = 0, skippedLimit = 0, errored = 0, skippedAiOff = 0;
  // Per-tick caches for the AI-switch lookups (one query per distinct org / user).
  const masterCache = new Map<number, boolean>();
  const agentCache = new Map<string, boolean>();
  for (const row of due) {
    try {
      // AI control gate (kill-switch): sequences are an Outbound AI path, so a
      // step holds in 'scheduled' unless the global master AND the Outbound
      // agent are on - it resumes when the switch is turned back on. Fail
      // closed: AI is off by default. (Skipped when org/user is unknown.)
      if (row.org_id != null && row.user_id != null) {
        let mOn = masterCache.get(row.org_id);
        if (mOn === undefined) { mOn = await isAiMasterEnabled(env, row.org_id); masterCache.set(row.org_id, mOn); }
        const ak = `${row.org_id}:${row.user_id}`;
        let aOn = agentCache.get(ak);
        if (aOn === undefined) { aOn = await isAgentEnabled(env, row.org_id, row.user_id, "outbound"); agentCache.set(ak, aOn); }
        if (!mOn || !aOn) {
          skippedAiOff++;
          continue;
        }
      }

      // Skip-this-tick quiet-hours guard. Leave the row in 'scheduled' so the
      // next 2-minute cron tick picks it up once the local window opens.
      if (row.org_id != null) {
        const quiet = await checkQuietHours(env, row.org_id, row.lead_timezone);
        if (quiet?.blocked) {
          skippedQuiet++;
          continue;
        }
      }

      await env.D1DB.prepare(
        `UPDATE step_executions SET status = 'processing', attempted_count = attempted_count + 1 WHERE id = ?`,
      ).bind(row.exec_id).run();

      // Enforce the org's monthly plan limit before sending. Over-limit steps
      // are marked 'skipped' (not retried) so the tick keeps draining the queue.
      const channel = row.channel === "sms" ? "sms" : "email";
      let withinLimit = true;
      if (row.org_id != null) {
        const plan = await getOrgPlan(env, row.org_id);
        withinLimit = await checkUsageLimit(env, row.org_id, plan, channel, 1);
      }

      let dispatched = false;
      if (!withinLimit) {
        await env.D1DB.prepare(
          `UPDATE step_executions SET status = 'skipped', result = ? WHERE id = ?`,
        ).bind(JSON.stringify({ skipped: "usage_limit_reached" }), row.exec_id).run();
        skippedLimit++;
        if (row.org_id != null) await notifyQuotaExceeded(env, row.org_id, channel);
        console.log(`[cron:sequenceDispatch] exec=${row.exec_id} ${channel} -> skipped (usage limit, org=${row.org_id})`);
        continue;
      }

      if (row.channel === "email" && row.lead_contact) {
        // CAN-SPAM opt-out: cancel the step if the lead has unsubscribed.
        if ((row.lead_email_opt_out ?? 0) === 1) {
          await env.D1DB.prepare(
            `UPDATE step_executions SET status = 'skipped', result = ? WHERE id = ?`,
          ).bind(JSON.stringify({ skipped: "lead opted out of email" }), row.exec_id).run();
          console.log(`[cron:sequenceDispatch] exec=${row.exec_id} email -> skipped (opt-out)`);
          continue;
        }
        // Marketing email without an agent address fails closed - we won't
        // ship a non-compliant CAN-SPAM message.
        if (!((row.sender_business_address || "").trim())) {
          await env.D1DB.prepare(
            `UPDATE step_executions SET status = 'failed', result = ? WHERE id = ?`,
          ).bind(JSON.stringify({ error: "Sender business address required for marketing email (set in Account settings)" }), row.exec_id).run();
          failed++;
          console.log(`[cron:sequenceDispatch] exec=${row.exec_id} email -> failed (missing business_address)`);
          continue;
        }
        dispatched = await sendEmail(env, row);
      } else if (row.channel === "sms" && row.lead_contact) {
        dispatched = await sendSms(
          env, row.org_id, row.lead_contact, row.message_template,
          row.step_number, row.sender_name,
          row.lead_sms_consent_status === "opted_in",
        );
      }

      if (dispatched && row.org_id != null) {
        await incrementUsage(env, row.org_id, channel, 1);
      }

      await env.D1DB.prepare(
        `UPDATE step_executions SET status = ?, sent_at = ?, result = ? WHERE id = ?`,
      ).bind(
        dispatched ? "sent" : "failed",
        dispatched ? new Date().toISOString() : null,
        JSON.stringify({ dispatched }),
        row.exec_id,
      ).run();

      // Surface sequence sends in the AI Activity feed as outbound actions
      // (mirrors scheduledMessages so the Outbound agent's Logs tab populates).
      try {
        if (row.org_id != null && row.lead_id != null) {
          await env.D1DB.prepare(
            `INSERT INTO ai_activity_log (org_id, user_id, agent_key, event, lead_id, detail, status)
             VALUES (?, ?, 'outbound', ?, ?, ?, ?)`,
          ).bind(
            row.org_id, row.user_id, dispatched ? "message.sent" : "message.failed",
            row.lead_id, (row.message_template || "").slice(0, 200), dispatched ? "ok" : "error",
          ).run();
        }
      } catch (e) { console.warn("[cron:sequenceDispatch] activity log failed", e); }

      if (dispatched) sent++; else failed++;
      console.log(`[cron:sequenceDispatch] exec=${row.exec_id} ${channel} -> ${dispatched ? "sent" : "failed"}`);
    } catch (err) {
      await env.D1DB.prepare(
        `UPDATE step_executions SET status = 'failed', result = ? WHERE id = ?`,
      ).bind(JSON.stringify({ error: String(err) }), row.exec_id).run();
      errored++;
      console.error(`[cron:sequenceDispatch] exec=${row.exec_id} errored`, err);
    }
  }
  console.log(`[cron:sequenceDispatch] summary: sent=${sent} failed=${failed} skippedQuiet=${skippedQuiet} skippedAiOff=${skippedAiOff} skippedLimit=${skippedLimit} errored=${errored}`);
}

async function sendEmail(env: CronEnv, row: DueRow): Promise<boolean> {
  // Honour the dynamic mock toggle so flipping it from /admin/debug takes
  // effect on the next cron tick. Mirrors functions/_shared/mockSendApi.ts:
  // mockElasticSendEmail - inlined here to avoid a cron->Pages-Functions
  // circular import.
  const orgId = row.org_id;
  const to = row.lead_contact;
  const subject = row.subject || "";
  const rawBody = row.message_template;

  // CAN-SPAM footer: address + signed unsubscribe link per lead. Caller
  // already ensured sender_business_address is present + lead_id resolves.
  let bodyHtml = rawBody;
  let listUnsubHeader: string | null = null;
  if (row.lead_id != null && row.sender_business_address) {
    const token = await makeUnsubscribeToken(row.lead_id, env.EMAIL_UNSUB_SIGNING_KEY);
    const url = unsubscribeUrl(row.lead_id, token, env.PUBLIC_BASE_URL);
    bodyHtml = appendCanSpamFooter(rawBody, {
      businessAddress: row.sender_business_address,
      unsubscribeUrl: url,
      senderName: row.sender_name ?? null,
    });
    listUnsubHeader = `<${url}>`;
  }

  if (await isMockSendsEnabled(env, orgId)) {
    await env.D1DB.prepare(
      `INSERT INTO mock_send_log
         (channel, provider, from_address, to_address, subject, body, org_id, rate_acquired, second_bucket)
       VALUES ('email', 'elastic', ?, ?, ?, ?, ?, 1, ?)`,
    ).bind(
      env.ELASTIC_SENDER_EMAIL || null,
      to,
      subject || null,
      bodyHtml || null,
      orgId,
      currentSecondBucket(),
    ).run();
    return true;
  }
  if (!env.ELASTIC_EMAIL_API_KEY) return false;
  const params = new URLSearchParams();
  params.set("apikey", env.ELASTIC_EMAIL_API_KEY);
  params.set("subject", subject || "(no subject)");
  params.set("from", env.ELASTIC_SENDER_EMAIL);
  params.set("fromName", env.ELASTIC_SENDER_NAME);
  params.set("to", to);
  params.set("bodyHtml", bodyHtml);
  if (listUnsubHeader) {
    params.set("headers_listunsubscribe", listUnsubHeader);
    params.set("headers_listunsubscribepost", "List-Unsubscribe=One-Click");
  }
  const res = await fetch("https://api.elasticemail.com/v2/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  return res.ok;
}

async function sendSms(
  env: CronEnv,
  orgId: number | null,
  to: string,
  body: string,
  stepNumber: number,
  agentName: string | null,
  recipientOptedIn: boolean,
): Promise<boolean> {
  // Suppression gate: a STOP / manual block recorded between scheduling and
  // dispatch must hard-stop the send. Inlined (rather than importing the
  // functions/_shared helper) to keep this worker free of cross-package
  // imports - the SQL is identical to suppression.ts: a hit in EITHER
  // sms_contact.opted_out OR lead.sms_opt_out for the (org, phone) pair.
  if (orgId != null) {
    const blocked = await env.D1DB.prepare(
      `SELECT 1 FROM sms_contact WHERE org_id = ? AND phone_number_e164 = ? AND opted_out = 1
       UNION
       SELECT 1 FROM lead WHERE org_id = ? AND phone = ?
         AND (sms_opt_out = 1 OR sms_consent_status = 'no_sms')
       LIMIT 1`,
    ).bind(orgId, to, orgId, to).first();
    if (blocked) {
      console.log(`[cron:sequenceDispatch] skipping send to ${to} (suppressed)`);
      return false;
    }
  }
  // Step 1 of a sequence = first message of the program (AI disclosure +
  // STOP footer). Steps 2+ are mid-program follow-ups (no extras). Mirrors
  // the appendComplianceFooter contract in functions/_shared.
  const finalBody = appendComplianceFooter(body, {
    kind: stepNumber === 1 ? "sequence_first" : "followup_in_thread",
    agentName,
    recipientOptedIn,
  });
  if (await isMockSendsEnabled(env, orgId)) {
    await env.D1DB.prepare(
      `INSERT INTO mock_send_log
         (channel, provider, from_address, to_address, subject, body, org_id, rate_acquired, second_bucket)
       VALUES ('sms', 'telnyx', NULL, ?, NULL, ?, ?, 1, ?)`,
    ).bind(
      to,
      finalBody || null,
      orgId,
      currentSecondBucket(),
    ).run();
    return true;
  }
  if (!env.TELNYX_API_KEY) return false;
  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, text: finalBody }),
  });
  return res.ok;
}
