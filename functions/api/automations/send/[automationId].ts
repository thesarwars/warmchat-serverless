/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst, queryAll, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { safeJson, type AutomationRow, type AutomationLead } from "../../../_shared/automationHelpers.ts";
import { loadOrgQuietConfig, evaluateQuietHours } from "../../../_shared/quietHours.ts";
import { appendComplianceFooter } from "../../../_shared/smsCompliance.ts";

/**
 * POST /api/automations/send/:automationId
 *
 * Queues one `scheduled_message` row per (lead x channel) with
 * `scheduled_at = now()`. The cron worker (workers/cron/jobs/scheduledMessages.ts)
 * is the single place where sends actually fire - it enforces per-second
 * provider rate limits via `tryAcquireSlot` and inserts the corresponding
 * `sms_message`/`inbox_messages` rows at the moment of dispatch.
 *
 * Returns immediately after queueing.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.automationId);
  if (!Number.isInteger(id)) return error("Invalid automation id", 400);

  const automation = await queryFirst<AutomationRow>(env.D1DB, `SELECT * FROM automation WHERE id = ?`, id);
  if (!automation) return error("Automation not found", 404);

  if (automation.status === "Paused") {
    return error("Automation is paused. Resume it to send messages.", 400);
  }

  const orgId = Number(automation.org_id);
  if (!Number.isInteger(orgId) || !(await isOrgMember(env, user.id, orgId))) {
    return error("User not part of organization", 403);
  }

  const channels = safeJson<string[]>(automation.channels, []).map((c) => c.toLowerCase());
  const leads = safeJson<AutomationLead[]>(automation.leads, []);
  const subject = automation.email_subject || automation.name || "(no subject)";
  const body = automation.message || "";
  const now = nowIso();
  const results: Array<{ lead: string; status: string; channel?: string }> = [];

  // Pre-load lead-level data for quiet hours + STOP compliance. We hit `lead`
  // once per lead-id (rather than per channel) so an automation that fans out to
  // both SMS and email doesn't double the read load.
  interface LeadInfo { timezone: string | null; sms_opt_out: number | null }
  const leadInfo = new Map<number, LeadInfo>();
  const leadIds = leads
    .map((l) => Number(l.id))
    .filter((n): n is number => Number.isInteger(n));
  if (leadIds.length > 0) {
    const placeholders = leadIds.map(() => "?").join(",");
    const rows = await queryAll<{ id: number; timezone: string | null; sms_opt_out: number | null }>(
      env.D1DB,
      `SELECT id, timezone, sms_opt_out FROM lead WHERE id IN (${placeholders})`,
      ...leadIds,
    );
    for (const r of rows) leadInfo.set(r.id, { timezone: r.timezone, sms_opt_out: r.sms_opt_out });
  }

  // Quiet hours: load the org window ONCE, then evaluate per-lead with no
  // further DB reads. compute scheduled_at = now() OR the next opening when blocked.
  const quietConfig = await loadOrgQuietConfig(env, orgId);
  function scheduledAtFor(leadId: number | null): string {
    const tz = leadId !== null ? leadInfo.get(leadId)?.timezone ?? null : null;
    const q = evaluateQuietHours(quietConfig, tz);
    if (q?.blocked) return q.until || now;
    return now;
  }

  let queuedEmails = 0;
  let queuedSms = 0;
  let skippedOptOut = 0;

  // Collect all INSERTs and flush them in batches, so a 1000-lead send is a
  // handful of round-trips rather than one subrequest per row (which blows the
  // free-tier 50-subrequest cap).
  const EMAIL_SQL = `INSERT INTO scheduled_message
       (user_id, org_id, contact_id, automation_id, channel, to_address, subject, body, scheduled_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'email', ?, ?, ?, ?, 'scheduled', ?, ?)`;
  const SMS_SQL = `INSERT INTO scheduled_message
       (user_id, org_id, contact_id, automation_id, channel, to_address, subject, body, scheduled_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'sms', ?, NULL, ?, ?, 'scheduled', ?, ?)`;
  const stmts: D1PreparedStatement[] = [];

  if (channels.includes("email")) {
    for (const lead of leads) {
      const toEmail = (lead.email || "").trim();
      if (!toEmail) {
        results.push({ lead: String(lead.id ?? ""), status: "skipped_no_email", channel: "email" });
        continue;
      }
      const leadId = Number.isInteger(Number(lead.id)) ? Number(lead.id) : null;
      const sendAt = scheduledAtFor(leadId);
      stmts.push(env.D1DB.prepare(EMAIL_SQL).bind(
        user.id, orgId, leadId, id, toEmail, subject, body, sendAt, now, now,
      ));
      queuedEmails += 1;
      results.push({ lead: toEmail, status: sendAt === now ? "queued" : "deferred_quiet_hours", channel: "email" });
    }
  }

  if (channels.includes("sms")) {
    // Each automation send is a single marketing blast (no follow-up chain
    // here - those are handled per-step in queueAutomationForLead). CTIA
    // requires the STOP footer on standalone marketing broadcasts; we do not
    // prepend the AI-disclosure (the agent typed the campaign body, not a
    // bot). Idempotent: bodies already carrying their own STOP wording are
    // left alone.
    const smsBody = appendComplianceFooter(body, { kind: "campaign" });
    for (const lead of leads) {
      const toPhone = (lead.phone || "").trim();
      if (!toPhone) {
        results.push({ lead: String(lead.id ?? ""), status: "skipped_no_phone", channel: "sms" });
        continue;
      }
      const leadId = Number.isInteger(Number(lead.id)) ? Number(lead.id) : null;
      // TCPA: never queue an SMS to a lead that's already opted out.
      if (leadId !== null && (leadInfo.get(leadId)?.sms_opt_out ?? 0) === 1) {
        skippedOptOut += 1;
        results.push({ lead: toPhone, status: "skipped_opt_out", channel: "sms" });
        continue;
      }
      const sendAt = scheduledAtFor(leadId);
      stmts.push(env.D1DB.prepare(SMS_SQL).bind(
        user.id, orgId, leadId, id, toPhone, smsBody, sendAt, now, now,
      ));
      queuedSms += 1;
      results.push({ lead: toPhone, status: sendAt === now ? "queued" : "deferred_quiet_hours", channel: "sms" });
    }
  }

  // D1 batch() runs each chunk as one transaction; chunk so very large sends
  // stay well under D1's per-batch statement limit.
  const BATCH_SIZE = 100;
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    await env.D1DB.batch(stmts.slice(i, i + BATCH_SIZE));
  }

  return json({
    success: true,
    queued_email: queuedEmails,
    queued_sms: queuedSms,
    skipped_opt_out: skippedOptOut,
    results,
  });
};
