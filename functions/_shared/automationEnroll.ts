/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst, queryAll, execute, nowIso } from "./db.ts";
import {
  queueScheduledMessage,
  renderTemplate,
  cancelPendingFollowups,
  isAiMasterEnabled,
  type LeadFull,
} from "./autoResponse.ts";
import { appendComplianceFooter } from "./smsCompliance.ts";
import { applyPersonalization, buildPersonalizationVars } from "./personalize.ts";
import { generateWithOpenAI } from "./openai.ts";
import { buildAgentSystemPrompt } from "./aiAgents.ts";
import { stepScheduledAt } from "./workflowSchedule.ts";
import { humanizeDashes } from "./humanizeText.ts";
import { tryNormalizeE164 } from "./phone.ts";
import { isPhoneSuppressed } from "./suppression.ts";

/** Split an array into fixed-size chunks (D1 caps bound params per query). */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * AI-personalize the opening outreach in the agent's voice (one bounded call per
 * enroll - a deliberate action, NOT the cron hot loop). Gated by the master AI
 * switch; returns the original template on any miss/error. {{tokens}} are kept
 * literal so renderTemplate can still expand them afterward.
 */
async function personalizeOpening(
  env: Env, orgId: number, userId: number, template: string, lead: LeadFull,
): Promise<string> {
  try {
    if (!env.OPENAI_API_KEY) return template;
    if (!(await isAiMasterEnabled(env, orgId))) return template;
    const sys = await buildAgentSystemPrompt(env, orgId, userId, "outbound");
    const ctx = [
      lead.first_name ? `first name: ${lead.first_name}` : null,
      lead.area ? `area: ${lead.area}` : null,
      lead.lead_type ? `type: ${lead.lead_type}` : null,
    ].filter(Boolean).join(", ");
    const user = `Rewrite this first outreach text in the agent's natural voice for this lead. Keep it to ONE short SMS (<= 300 chars), warm and human, at most ONE question. Keep any {{tokens}} EXACTLY as written - they are filled in later. Do not wrap it in quotes. Lead: ${ctx || "unknown"}.\n\nTemplate: ${template}`;
    const out = await generateWithOpenAI(env, sys, user, { orgId });
    const text = humanizeDashes((out.text || "").trim());
    return text || template;
  } catch {
    return template;
  }
}

/**
 * Enroll ONE lead into an automation's OUTBOUND drip. The automation's opening
 * `message` (sent shortly after enroll) plus its `followup_steps` are queued
 * into `scheduled_message` - the same queue + cron (scheduledMessages) every
 * other outbound send uses, so the drip is visible to the usual tooling and
 * goes through the standard compliance guards (suppression, quiet hours, rate
 * limits) at send time.
 *
 * One automation per lead: any pending scheduled messages for the lead are
 * cancelled first (switch semantics). Returns the number of messages queued
 * (0 when the lead has no contact for the channel, or was suppressed).
 */
interface AutomationRow {
  id: number;
  message: string | null;
  email_subject: string | null; // subject line for email steps (opening default)
  opening_send_time: string | null; // NULL = instant opening; "HH:MM" = timed
  channels: string | null;       // JSON string array, e.g. ["sms"]
  followup_steps: string | null; // JSON array of { delay_days, message, send_time }
}
interface FollowupStep { delay_days?: number; message?: string; send_time?: string; timezone?: string; channel?: string; subject?: string }

/** Normalize a per-step channel value, falling back to the campaign default. */
function normChannel(raw: unknown, fallback: "sms" | "email"): "sms" | "email" {
  const s = String(raw || "").trim().toLowerCase();
  return s === "email" ? "email" : s === "sms" ? "sms" : fallback;
}

/** Read the org's account timezone (the single source for step send times). */
async function loadOrgTimezone(env: Env, orgId: number): Promise<string | null> {
  const row = await queryFirst<{ timezone: string | null }>(
    env.D1DB, `SELECT timezone FROM organization WHERE id = ?`, orgId,
  );
  return (row?.timezone || "").trim() || null;
}

function firstChannel(rawChannels: string | null): "sms" | "email" {
  try {
    const arr = JSON.parse(rawChannels || "[]");
    if (Array.isArray(arr) && typeof arr[0] === "string" && arr[0].toLowerCase() === "email") {
      return "email";
    }
  } catch { /* fall through */ }
  return "sms";
}

/** The full set of channels a campaign uses, e.g. {"email","sms"}. */
function parseChannels(rawChannels: string | null): Set<"sms" | "email"> {
  const out = new Set<"sms" | "email">();
  try {
    const arr = JSON.parse(rawChannels || "[]");
    if (Array.isArray(arr)) {
      for (const c of arr) {
        const s = String(c).toLowerCase();
        if (s === "sms" || s === "email") out.add(s);
      }
    }
  } catch { /* none */ }
  if (out.size === 0) out.add("sms");
  return out;
}

/**
 * Every channel a lead should receive a message on: each channel the campaign
 * has selected AND the lead has a usable (non-suppressed) address for. The per-
 * message channel is intentionally ignored - the campaign's channel selection is
 * the single source of truth, applied per lead:
 *   - campaign [SMS, Email], lead has both  -> BOTH (one SMS + one email)
 *   - campaign [SMS, Email], lead phone only -> SMS only
 *   - campaign [SMS, Email], lead email only -> Email only
 *   - campaign [SMS] only -> SMS only (email-only leads get nothing -> logged "not sent")
 * Returns [] when the lead can't be reached on any selected channel.
 */
function resolveLeadChannels(
  campaignChannels: Set<"sms" | "email">,
  canSms: boolean,
  canEmail: boolean,
): Array<"sms" | "email"> {
  const out: Array<"sms" | "email"> = [];
  if (campaignChannels.has("sms") && canSms) out.push("sms");
  if (campaignChannels.has("email") && canEmail) out.push("email");
  return out;
}

/**
 * Human-readable reason a lead couldn't be reached on any selected channel, for
 * the visible "not sent" log row (e.g. "no phone number" when an SMS-only
 * campaign hits a lead without a phone).
 */
function leadSkipReason(
  campaignChannels: Set<"sms" | "email">,
  phone: string | null,
  email: string | null,
): string {
  const parts: string[] = [];
  if (campaignChannels.has("sms") && !phone) parts.push("no phone number");
  if (campaignChannels.has("email") && !email) parts.push("no email address");
  return parts.length ? parts.join(", ") : "opted out / unavailable";
}

export async function queueAutomationForLead(
  env: Env, automationId: number, leadId: number, fallbackUserId: number,
): Promise<number> {
  const camp = await queryFirst<AutomationRow>(
    env.D1DB,
    `SELECT id, message, email_subject, opening_send_time, channels, followup_steps FROM automation WHERE id = ?`,
    automationId,
  );
  if (!camp) return 0;
  const emailSubject = (camp.email_subject || "").trim() || null;
  const lead = await queryFirst<LeadFull & {
    sms_consent_status: string | null; timezone: string | null;
    sms_opt_out: number | null; email_opt_out: number | null;
  }>(
    env.D1DB,
    `SELECT id, org_id, owner_id, first_name, last_name, name, email, phone, area, lead_type,
            sms_consent_status, timezone, sms_opt_out, email_opt_out
       FROM lead WHERE id = ?`,
    leadId,
  );
  if (!lead) return 0;
  const recipientOptedIn = lead.sms_consent_status === "opted_in";
  // Step send times are wall-clock in the lead's timezone, falling back to the
  // org's account timezone (the single source of truth).
  const sendTz = (lead.timezone || "").trim() || (await loadOrgTimezone(env, lead.org_id));

  // Mixed-channel campaigns: the opening uses the campaign's primary channel;
  // each follow-up may override with its own channel (sms or email). A lead with
  // no address for a given step's channel simply skips that step.
  const campaignChannel = firstChannel(camp.channels);
  const campaignChannels = parseChannels(camp.channels);

  // Per lead: every selected channel the lead can receive (both, if it has both).
  // Suppression-aware (matching the bulk path) so an opted-out lead yields no
  // reachable channel and logs a single "not sent" row instead of silently
  // dropping at send time.
  const userId = lead.owner_id ?? fallbackUserId;
  const smsSuppressed = !lead.phone
    || (await isPhoneSuppressed(env, lead.org_id, lead.phone))
    || lead.sms_opt_out === 1
    || lead.sms_consent_status === "no_sms";
  const emailSuppressed = !lead.email || lead.email_opt_out === 1;
  const canSms = !smsSuppressed && !!lead.phone;
  const canEmail = !emailSuppressed && !!lead.email;
  const sendChannels = resolveLeadChannels(campaignChannels, canSms, canEmail);

  // One automation per lead - cancel any pending messages before starting this one.
  await cancelPendingFollowups(env, leadId);

  // No reachable selected channel -> a visible "not sent" row (cron ignores
  // 'skipped') instead of a silent no-op, so the Logs show why.
  if (sendChannels.length === 0) {
    const ts = nowIso();
    await execute(
      env.D1DB, SKIPPED_INSERT_SQL,
      userId, lead.org_id, leadId, automationId,
      campaignChannels.has("sms") ? "sms" : "email",
      ts, leadSkipReason(campaignChannels, lead.phone, lead.email), ts, ts,
    );
    return 0;
  }

  // Build the ordered drip: instant opening message + each timed follow-up.
  // Step 0 (the opening) is INSTANT (sent ~30s after enroll); each follow-up
  // fires `delay_days` later at its `send_time` wall-clock hour.
  const openingTime = (camp.opening_send_time || "").trim() || null;
  const drip: Array<{ body: string; instant: boolean; delayDays: number; sendTime: string | null; tz?: string | null; channel: "sms" | "email"; subject: string | null }> = [];
  if ((camp.message || "").trim()) {
    const opening = await personalizeOpening(
      env, lead.org_id, lead.owner_id ?? fallbackUserId, camp.message!.trim(), lead);
    // Instant unless the opening has been given an explicit send time, in which
    // case it is scheduled for that wall-clock time on the enrollment day.
    drip.push({ body: opening, instant: !openingTime, delayDays: 0, sendTime: openingTime, channel: campaignChannel, subject: emailSubject });
  }
  let followups: FollowupStep[] = [];
  try {
    const parsed = JSON.parse(camp.followup_steps || "[]");
    if (Array.isArray(parsed)) followups = parsed as FollowupStep[];
  } catch { /* none */ }
  for (const f of followups) {
    if (!(f.message || "").trim()) continue;
    const days = typeof f.delay_days === "number" && f.delay_days > 0 ? f.delay_days : 0;
    drip.push({ body: f.message!.trim(), instant: false, delayDays: days, sendTime: f.send_time ?? null, tz: f.timezone || null, channel: normChannel(f.channel, campaignChannel), subject: (f.subject || "").trim() || emailSubject });
  }
  if (drip.length === 0) return 0;

  // Resolve the owner's name once so the AI disclosure prefix on the opening
  // message reads "(Automated msg from {Agent Name})".
  const owner = await queryFirst<{ name: string | null }>(
    env.D1DB, `SELECT name FROM "user" WHERE id = ?`, userId,
  );
  const agentName = owner?.name ?? null;
  const now = Date.now();
  let queued = 0;
  for (let i = 0; i < drip.length; i++) {
    const step = drip[i]!;
    const rendered = await renderTemplate(env, step.body, lead);
    // A scheduled step whose computed wall-time already passed (e.g. a same-day
    // opening time enrolled after that hour) should send PROMPTLY, not sit at a
    // past timestamp - so clamp anything in the past up to now+30s. (The wizard
    // already blocks picking a past same-day time for immediate enrollments.)
    const computedAt = step.instant
      ? new Date(now + 30 * 1000).toISOString()
      : stepScheduledAt(now, step.delayDays, step.sendTime, step.tz || sendTz);
    const scheduledAt = Date.parse(computedAt) < now ? new Date(now + 30 * 1000).toISOString() : computedAt;
    // Send this step on EVERY channel the lead can receive (both, if it has both).
    for (const channel of sendChannels) {
      const toAddress = channel === "sms" ? (tryNormalizeE164(lead.phone) || lead.phone!) : lead.email!;
      // Step 0 of the drip is the opening (first message in the sequence). It
      // gets the AI disclosure + STOP footer. Steps 1+ are follow-ups in the
      // same program - already known recipient, no extra wrapping.
      const body = channel === "sms"
        ? appendComplianceFooter(rendered, {
            kind: i === 0 ? "sequence_first" : "followup_in_thread",
            agentName,
            recipientOptedIn,
          })
        : rendered;
      const id = await queueScheduledMessage(env, {
        leadId, orgId: lead.org_id, userId,
        channel, toAddress, body,
        subject: channel === "email" ? step.subject : null,
        scheduledAt,
        // Outbound automation drip: NOT tagged as "AI Agent" - the inbox marks
        // these with the campaign/workflow name instead (derived from
        // automation_id on the materialized message row).
        automationId,
      });
      if (id) queued++;
    }
  }
  return queued;
}

// Statements per D1 batch round-trip (one atomic transaction). Mirrors the
// leads-import flush so the two stay in lock-step.
const ENROLL_BATCH = 50;
// Bound params per read/UPDATE IN-list; kept well under D1's per-query cap.
const IN_CHUNK = 90;

const SCHEDULED_INSERT_SQL =
  `INSERT INTO scheduled_message
     (user_id, org_id, contact_id, automation_id, channel, to_address, subject, body,
      scheduled_at, sent_by_ai, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`;

// A visible "not sent" row for a lead with no reachable selected channel. status
// 'skipped' is never picked up by the cron (it only drains 'scheduled'); it exists
// purely so the workflow Logs can show "<lead> - <reason> - not sent".
const SKIPPED_INSERT_SQL =
  `INSERT INTO scheduled_message
     (user_id, org_id, contact_id, automation_id, channel, to_address, subject, body,
      scheduled_at, sent_by_ai, status, error_message, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, '', NULL, '', ?, 0, 'skipped', ?, ?, ?)`;

interface EnrollLeadRow {
  id: number;
  org_id: number;
  owner_id: number | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  area: string | null;
  sms_consent_status: string | null;
  sms_opt_out: number | null;
  email_opt_out: number | null;
  timezone: string | null;
}

/**
 * Batched bulk version of queueAutomationForLead. Enrolls MANY leads into an
 * automation's outbound drip with a handful of round-trips instead of the
 * per-lead query storm (the same optimization the leads import made: ~N serial
 * writes -> a few batched transactions). Every compliance behavior of the
 * single-lead path is preserved:
 *   - one automation per lead (pending drips cancelled first, batched),
 *   - STOP/suppression honored (sms_contact.opted_out + lead flags, pre-loaded
 *     once and checked in memory - never re-queried per message),
 *   - the AI disclosure + STOP footer on the opening, follow-ups un-wrapped,
 *   - {{token}} personalization against the lead + owner name.
 *
 * Difference from the single-lead path: it does NOT make a per-lead OpenAI
 * "rewrite the opening in the agent's voice" call. On a bulk audience send that
 * is N LLM calls (cost + latency + usage) to rewrite copy the user already
 * authored in the wizard - the template (with tokens) is used verbatim instead.
 *
 * Returns the number of leads that had at least one message queued.
 */
export async function bulkEnrollAutomation(
  env: Env, automationId: number, leadIds: number[], fallbackUserId: number,
): Promise<{ enrolled: number; queued: number }> {
  const ids = [...new Set(leadIds.filter((n) => Number.isInteger(n)))];
  if (!ids.length) return { enrolled: 0, queued: 0 };

  const camp = await queryFirst<AutomationRow & { org_id: number }>(
    env.D1DB,
    `SELECT id, org_id, message, email_subject, opening_send_time, channels, followup_steps FROM automation WHERE id = ?`,
    automationId,
  );
  if (!camp) return { enrolled: 0, queued: 0 };
  const orgId = Number(camp.org_id);
  const emailSubject = (camp.email_subject || "").trim() || null;
  // Campaign primary channel = opening channel; each follow-up may override it
  // (mixed-channel campaigns), resolved per step below. campaignChannels is the
  // full set, used to fall a lead back onto the other channel when it has no
  // address for a step's declared channel.
  const campaignChannel = firstChannel(camp.channels);
  const campaignChannels = parseChannels(camp.channels);

  // Build the drip template (opening + follow-ups) ONCE - it is identical for
  // every lead apart from per-lead token expansion + scheduling done in the row
  // loop. Step 0 (opening) is INSTANT; follow-ups carry a day + send_time.
  const openingTime = (camp.opening_send_time || "").trim() || null;
  const template: Array<{ body: string; instant: boolean; delayDays: number; sendTime: string | null; tz?: string | null; channel: "sms" | "email"; subject: string | null }> = [];
  if ((camp.message || "").trim()) template.push({ body: camp.message!.trim(), instant: !openingTime, delayDays: 0, sendTime: openingTime, channel: campaignChannel, subject: emailSubject });
  let followups: FollowupStep[] = [];
  try {
    const parsed = JSON.parse(camp.followup_steps || "[]");
    if (Array.isArray(parsed)) followups = parsed as FollowupStep[];
  } catch { /* none */ }
  for (const f of followups) {
    if (!(f.message || "").trim()) continue;
    const days = typeof f.delay_days === "number" && f.delay_days > 0 ? f.delay_days : 0;
    template.push({ body: f.message!.trim(), instant: false, delayDays: days, sendTime: f.send_time ?? null, tz: f.timezone || null, channel: normChannel(f.channel, campaignChannel), subject: (f.subject || "").trim() || emailSubject });
  }
  if (!template.length) return { enrolled: 0, queued: 0 };
  // A lead can be routed onto SMS by the cross-channel fallback even if no step
  // DECLARES sms, so load the SMS suppression set whenever the campaign offers
  // sms at all - not only when a step's declared channel is sms.
  const templateHasSms = campaignChannels.has("sms") || template.some((s) => s.channel === "sms");

  // Account timezone for interpreting each step's send_time wall clock.
  const orgTz = await loadOrgTimezone(env, orgId);

  // 1) Bulk-load the leads (chunked IN).
  const leads: EnrollLeadRow[] = [];
  for (const part of chunk(ids, IN_CHUNK)) {
    const rows = await queryAll<EnrollLeadRow>(
      env.D1DB,
      `SELECT id, org_id, owner_id, first_name, last_name, name, email, phone, area,
              sms_consent_status, sms_opt_out, email_opt_out, timezone
         FROM lead WHERE id IN (${part.map(() => "?").join(",")}) AND org_id = ?`,
      ...part, orgId,
    );
    leads.push(...rows);
  }
  if (!leads.length) return { enrolled: 0, queued: 0 };

  // 2) Bulk-load owner display names (for the AI-disclosure prefix + {{agent_name}}).
  const ownerIds = [...new Set(leads.map((l) => l.owner_id ?? fallbackUserId).filter((n) => Number.isInteger(n)))];
  const ownerName = new Map<number, string>();
  for (const part of chunk(ownerIds, IN_CHUNK)) {
    const rows = await queryAll<{ id: number; name: string | null }>(
      env.D1DB,
      `SELECT id, name FROM "user" WHERE id IN (${part.map(() => "?").join(",")})`,
      ...part,
    );
    for (const r of rows) ownerName.set(r.id, (r.name || "").trim());
  }

  // 3) Suppression set (SMS): every opted-out number in the org, loaded once.
  //    Lead-level flags (sms_opt_out / no_sms / email_opt_out) ride on each row.
  const optedOutPhones = new Set<string>();
  if (templateHasSms) {
    const rows = await queryAll<{ phone: string | null }>(
      env.D1DB,
      `SELECT phone_number_e164 AS phone FROM sms_contact WHERE org_id = ? AND opted_out = 1`,
      orgId,
    );
    for (const r of rows) if (r.phone) optedOutPhones.add(r.phone);
  }

  // 4) One automation per lead: cancel any pending drip for the whole set first
  //    (batched UPDATE per chunk), matching cancelPendingFollowups semantics.
  const now = nowIso();
  for (const part of chunk(leads.map((l) => l.id), IN_CHUNK)) {
    await execute(
      env.D1DB,
      `UPDATE scheduled_message SET status = 'cancelled', updated_at = ?
        WHERE contact_id IN (${part.map(() => "?").join(",")}) AND status = 'scheduled'`,
      now, ...part,
    );
  }

  // 5) Build every scheduled_message insert, then flush in batched transactions.
  const stmt = env.D1DB.prepare(SCHEDULED_INSERT_SQL);
  const skipStmt = env.D1DB.prepare(SKIPPED_INSERT_SQL);
  const binds: D1PreparedStatement[] = [];
  const startMs = Date.now();
  let enrolled = 0;
  let queuedRows = 0; // real send rows only (excludes 'skipped' not-sent markers)
  for (const lead of leads) {
    const smsSuppressed = !lead.phone || optedOutPhones.has(lead.phone) || lead.sms_opt_out === 1 || lead.sms_consent_status === "no_sms";
    const emailSuppressed = !lead.email || lead.email_opt_out === 1;

    const userId = lead.owner_id ?? fallbackUserId;
    const agentName = ownerName.get(userId) || null;
    const recipientOptedIn = lead.sms_consent_status === "opted_in";
    const vars = buildPersonalizationVars(lead, agentName || "");
    const sendTz = (lead.timezone || "").trim() || orgTz;
    const canSms = !smsSuppressed && !!lead.phone;
    const canEmail = !emailSuppressed && !!lead.email;

    // Per lead: send on EVERY selected channel the lead can receive (both, if the
    // lead has both and the campaign uses both). No reachable channel -> record a
    // single visible "not sent" row with the reason instead of silently skipping.
    const sendChannels = resolveLeadChannels(campaignChannels, canSms, canEmail);
    if (sendChannels.length === 0) {
      const channelLabel = campaignChannels.has("sms") ? "sms" : "email";
      binds.push(skipStmt.bind(
        userId, lead.org_id, lead.id, automationId, channelLabel,
        now, leadSkipReason(campaignChannels, lead.phone, lead.email), now, now,
      ));
      continue;
    }

    let leadQueued = 0;
    for (let i = 0; i < template.length; i++) {
      const step = template[i]!;
      const rendered = applyPersonalization(step.body, vars);
      const computedAt = step.instant
        ? new Date(startMs + 30 * 1000).toISOString()
        : stepScheduledAt(startMs, step.delayDays, step.sendTime, step.tz || sendTz);
      // Past same-day time (e.g. opening "today at 9am" enrolled at 5pm) sends
      // promptly rather than at a past timestamp; never silently rolls a day.
      const scheduledAt = Date.parse(computedAt) < startMs ? new Date(startMs + 30 * 1000).toISOString() : computedAt;
      for (const channel of sendChannels) {
        const toAddress = channel === "sms" ? (tryNormalizeE164(lead.phone) || lead.phone!) : lead.email!;
        const body = channel === "sms"
          ? appendComplianceFooter(rendered, {
              kind: i === 0 ? "sequence_first" : "followup_in_thread",
              agentName,
              recipientOptedIn,
            })
          : rendered;
        // Email steps carry the campaign's subject; SMS has no subject.
        const subject = channel === "email" ? step.subject : null;
        binds.push(stmt.bind(
          userId, lead.org_id, lead.id, automationId, channel, toAddress, subject, body,
          scheduledAt, 0, now, now,
        ));
        leadQueued++;
      }
    }
    if (leadQueued > 0) enrolled++;
    queuedRows += leadQueued;
  }

  for (const part of chunk(binds, ENROLL_BATCH)) {
    try {
      await env.D1DB.batch(part);
    } catch {
      // Isolate: re-run the chunk statement-by-statement so one bad row can't
      // roll back its 49 neighbors (matches the import's per-row fallback).
      for (const s of part) { try { await s.run(); } catch { /* skip */ } }
    }
  }

  return { enrolled, queued: queuedRows };
}
