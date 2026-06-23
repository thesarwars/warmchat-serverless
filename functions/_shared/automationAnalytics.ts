/// <reference types="@cloudflare/workers-types" />
/**
 * Per-automation KPI helpers: outbound message counts, per-lead email + SMS
 * reply stats, appointments. Used by the list, summary and details endpoints.
 */
import type { Env } from "./env.ts";
import { queryFirst, queryAll } from "./db.ts";
import { tryNormalizeE164 } from "./phone.ts";
import { safeJson, leadIdsFromAutomation, type AutomationRow, type AutomationLead } from "./automationHelpers.ts";
import {
  calculatePipelineValue,
  DEFAULT_AVERAGE_DEAL_PRICE,
  DEFAULT_COMMISSION_PERCENT,
  type PipelineLead,
} from "./pipeline.ts";

const HIGH_INTENT_VALUES = new Set(["interested", "high intent", "high_intent", "high-intent"]);

// D1 caps bound params per statement (~100). A per-automation IN-list of every
// lead phone/id overflows that on a large campaign (e.g. 1,375 leads), throwing
// "too many SQL variables" -> the whole /details endpoint 500s. Chunk every
// IN-list well under the cap and aggregate in JS.
const IN_CHUNK = 90;
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normEmail(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function isHighIntent(metaJson: string | null | undefined): boolean {
  if (!metaJson) return false;
  try {
    const meta = JSON.parse(metaJson) as Record<string, unknown>;
    const intent = String(meta.intent ?? meta.ai_intent ?? "").trim().toLowerCase();
    return HIGH_INTENT_VALUES.has(intent);
  } catch { return false; }
}

/** ISO-string compare; nulls sort last. Prefers message_date, falls back to created_at. */
function pickMessageTs(msgDate: string | null, createdAt: string | null): string | null {
  return msgDate || createdAt;
}

/** Outbound email rows on the automation's thread + outbound SMS rows to lead phones. */
export async function countOutboundMessagesSent(
  env: Env, automation: AutomationRow, orgId: number,
): Promise<number> {
  let total = 0;

  if (automation.thread_id) {
    const row = await queryFirst<{ n: number }>(
      env.D1DB,
      `SELECT COUNT(id) AS n FROM inbox_messages
        WHERE thread_id = ? AND direction = 'outbound'`,
      automation.thread_id,
    );
    total += row?.n ?? 0;
  }

  const leads = safeJson<AutomationLead[]>(automation.leads, []);
  const phones: string[] = [];
  for (const lead of leads) {
    const phone = tryNormalizeE164(lead.phone);
    if (phone) phones.push(phone);
  }

  if (phones.length > 0 && automation.created_at) {
    for (const part of chunk(phones, IN_CHUNK)) {
      const placeholders = part.map(() => "?").join(",");
      const row = await queryFirst<{ n: number }>(
        env.D1DB,
        `SELECT COUNT(m.id) AS n
           FROM sms_message m
           JOIN sms_conversation c ON c.id = m.conversation_id
           JOIN sms_contact ct ON ct.id = c.contact_id
          WHERE c.org_id = ?
            AND m.direction = 'outbound'
            AND ct.phone_number_e164 IN (${placeholders})
            AND m.created_at >= ?`,
        orgId, ...part, automation.created_at,
      );
      total += row?.n ?? 0;
    }
  }

  const contacts = leads.length;
  return Math.max(total, contacts);
}

/** Appointments booked for automation leads after the automation was created. */
export async function countConvertedLeads(
  env: Env, automation: AutomationRow, orgId: number,
): Promise<number> {
  const leads = safeJson<AutomationLead[]>(automation.leads, []);
  const ids = leadIdsFromAutomation(leads);
  if (ids.length === 0) return 0;

  let total = 0;
  for (const part of chunk(ids, IN_CHUNK)) {
    const placeholders = part.map(() => "?").join(",");
    const params: unknown[] = [orgId, ...part];
    let sql =
      `SELECT COUNT(id) AS n FROM lead_appointment
        WHERE org_id = ? AND lead_id IN (${placeholders})
          AND COALESCE(status, '') <> 'cancelled'`;
    if (automation.created_at) {
      sql += ` AND created_at >= ?`;
      params.push(automation.created_at);
    }
    const row = await queryFirst<{ n: number }>(env.D1DB, sql, ...params);
    total += row?.n ?? 0;
  }
  return total;
}

export interface LeadReplyStats {
  replies: number;
  last_activity: string | null;
  last_preview: string | null;
  high_intent: boolean;
  thread_id?: number | null;
  conversation_id?: number | null;
  channel?: string;
}

interface EmailInboundRow {
  body: string | null;
  message_date: string | null;
  created_at: string | null;
  meta: string | null;
  sender_email: string | null;
}

interface SmsInboundRow {
  body: string | null;
  created_at: string | null;
  phone_number_e164: string;
  conversation_id: number;
}

/**
 * Fold inbound email rows into a map keyed by lower-cased sender_email. Pure
 * (no DB) so it can be shared by the single-automation loader and the org-wide
 * batch path. `threadId` is stamped onto each entry for the UI.
 */
function aggregateEmailRows(
  rows: EmailInboundRow[], threadId: number | null | undefined,
): Map<string, LeadReplyStats> {
  const out = new Map<string, LeadReplyStats>();
  for (const row of rows) {
    const key = normEmail(row.sender_email);
    if (!key) continue;
    const ts = pickMessageTs(row.message_date, row.created_at);
    const existing = out.get(key);
    const high = isHighIntent(row.meta);
    if (!existing) {
      out.set(key, {
        replies: 1,
        last_activity: ts,
        last_preview: (row.body || "").slice(0, 280),
        high_intent: high,
        thread_id: threadId ?? null,
        channel: "email",
      });
    } else {
      existing.replies += 1;
      const existingTs = existing.last_activity;
      if (ts && (!existingTs || ts > existingTs)) {
        existing.last_activity = ts;
        existing.last_preview = (row.body || "").slice(0, 280);
      }
      if (high) existing.high_intent = true;
    }
  }
  return out;
}

/**
 * Batch-load all email replies for the automation thread into a map keyed by
 * lower-cased sender_email. Avoids the N+1 query problem that made
 * /api/automations/:id/details hang on large automations.
 */
async function loadEmailRepliesByLead(
  env: Env, automation: AutomationRow,
): Promise<Map<string, LeadReplyStats>> {
  if (!automation.thread_id) return new Map();

  const params: unknown[] = [automation.thread_id];
  let where = `m.thread_id = ?
                 AND m.direction = 'inbound'
                 AND LOWER(COALESCE(m.channel, 'email')) = 'email'`;
  if (automation.created_at) {
    where += ` AND COALESCE(m.message_date, m.created_at) >= ?`;
    params.push(automation.created_at);
  }

  const rows = await queryAll<EmailInboundRow>(
    env.D1DB,
    `SELECT m.body, m.message_date, m.created_at, m.meta, m.sender_email
       FROM inbox_messages m
      WHERE ${where}`,
    ...params,
  );

  return aggregateEmailRows(rows, automation.thread_id);
}

/** Fold inbound SMS rows into a map keyed by E.164 phone. Pure (no DB). */
function aggregateSmsRows(rows: SmsInboundRow[]): Map<string, LeadReplyStats> {
  const out = new Map<string, LeadReplyStats>();
  for (const row of rows) {
    const key = row.phone_number_e164;
    if (!key) continue;
    const existing = out.get(key);
    if (!existing) {
      out.set(key, {
        replies: 1,
        last_activity: row.created_at,
        last_preview: (row.body || "").slice(0, 280),
        high_intent: false,
        conversation_id: row.conversation_id,
        channel: "sms",
      });
    } else {
      existing.replies += 1;
      const existingTs = existing.last_activity;
      if (row.created_at && (!existingTs || row.created_at > existingTs)) {
        existing.last_activity = row.created_at;
        existing.last_preview = (row.body || "").slice(0, 280);
      }
    }
  }
  return out;
}

/** Same idea for SMS replies, keyed by E.164 phone. */
async function loadSmsRepliesByLead(
  env: Env, automation: AutomationRow, orgId: number, leads: AutomationLead[],
): Promise<Map<string, LeadReplyStats>> {
  const phones: string[] = [];
  for (const lead of leads) {
    const phone = tryNormalizeE164(lead.phone);
    if (phone) phones.push(phone);
  }
  if (phones.length === 0) return new Map();

  const rows: SmsInboundRow[] = [];
  for (const part of chunk(phones, IN_CHUNK)) {
    const placeholders = part.map(() => "?").join(",");
    const params: unknown[] = [orgId, ...part];
    let where =
      `c.org_id = ? AND ct.phone_number_e164 IN (${placeholders}) AND m.direction = 'inbound'`;
    if (automation.created_at) {
      where += ` AND m.created_at >= ?`;
      params.push(automation.created_at);
    }
    const part_rows = await queryAll<SmsInboundRow>(
      env.D1DB,
      `SELECT m.body, m.created_at, ct.phone_number_e164, c.id AS conversation_id
         FROM sms_message m
         JOIN sms_conversation c ON c.id = m.conversation_id
         JOIN sms_contact ct ON ct.id = c.contact_id
        WHERE ${where}`,
      ...params,
    );
    rows.push(...part_rows);
  }

  return aggregateSmsRows(rows);
}

function emptyStats(): LeadReplyStats {
  return { replies: 0, last_activity: null, last_preview: null, high_intent: false };
}

function mergeLeadReplyStats(emailStats: LeadReplyStats, smsStats: LeadReplyStats): LeadReplyStats {
  const emailReplies = emailStats.replies || 0;
  const smsReplies = smsStats.replies || 0;
  const total = emailReplies + smsReplies;

  const parseTs = (iso: string | null): number | null => {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
  };
  const emailTs = parseTs(emailStats.last_activity);
  const smsTs = parseTs(smsStats.last_activity);

  let primary: LeadReplyStats = emailStats;
  if (smsTs !== null && (emailTs === null || smsTs > emailTs)) {
    primary = smsStats;
  } else if (smsTs === null && emailTs !== null) {
    primary = emailStats;
  } else if (smsReplies > emailReplies) {
    primary = smsStats;
  }

  return {
    replies: total,
    last_activity: primary.last_activity || emailStats.last_activity || smsStats.last_activity,
    last_preview: primary.last_preview || emailStats.last_preview || smsStats.last_preview,
    high_intent: Boolean(emailStats.high_intent || smsStats.high_intent),
    thread_id: emailStats.thread_id ?? null,
    conversation_id: smsStats.conversation_id ?? null,
    channel: primary.channel ?? "email",
  };
}

export interface RecipientRow {
  id: number | string | undefined;
  name: string;
  email: string;
  phone: string;
  status: string;
  engagement_status: string;
  replies: number;
  last_activity: string | null;
  thread_id: number | null | undefined;
  conversation_id: number | null | undefined;
  channel: string | undefined;
}

export interface ReplySectionRow {
  lead_id: number | string | undefined;
  name: string;
  email: string;
  last_reply_at: string | null;
  last_reply_preview: string | null;
  thread_id: number | null | undefined;
  conversation_id: number | null | undefined;
  channel: string | undefined;
}

export interface AutomationRecipientStats {
  contacts_sent: number;
  messages_sent: number;
  pending?: number; // scheduled_message rows still status='scheduled' (0 => drained/Completed); set by computeAutomationStatsBatch
  replied_lead_count: number;
  reply_rate: number;
  conversion_rate: number;
  converted: number;
  delivered: number;
  opened: number;
  delivered_rate: number;
  open_rate: number;
  positive_replies: number;
  replies_total: number;
  recipients: RecipientRow[];
  replies_section: ReplySectionRow[];
}

/**
 * Pure assembly of one automation's stats from already-loaded reply maps + the
 * two scalar counts. Shared by the single-automation path (which loads the maps
 * with per-automation queries) and the org-wide batch path (which loads them
 * once and slices in memory), so both produce byte-identical output.
 */
function assembleAutomationStats(
  automation: AutomationRow,
  leads: AutomationLead[],
  emailMap: Map<string, LeadReplyStats>,
  smsMap: Map<string, LeadReplyStats>,
  messagesSent: number,
  converted: number,
): AutomationRecipientStats {
  const contactsSent = leads.length;
  const recipients: RecipientRow[] = [];
  const repliesSection: ReplySectionRow[] = [];
  let positiveReplyCount = 0;
  let repliedLeadCount = 0;

  for (const lead of leads) {
    const emailKey = normEmail(lead.email);
    const phoneKey = tryNormalizeE164(lead.phone);
    const emailStats = emailKey ? emailMap.get(emailKey) ?? emptyStats() : emptyStats();
    const smsStats = phoneKey ? smsMap.get(phoneKey) ?? emptyStats() : emptyStats();
    if (emailStats.replies > 0) emailStats.thread_id = automation.thread_id;
    const merged = mergeLeadReplyStats(emailStats, smsStats);

    if (merged.replies > 0) repliedLeadCount += 1;
    if (merged.high_intent) positiveReplyCount += 1;

    recipients.push({
      id: lead.id,
      name: lead.name || lead.email || "",
      email: lead.email || "",
      phone: lead.phone || "",
      status: lead.status || "",
      engagement_status: merged.replies > 0 ? "Replied" : "Sent",
      replies: merged.replies,
      last_activity: merged.last_activity,
      thread_id: merged.thread_id ?? null,
      conversation_id: merged.conversation_id ?? null,
      channel: merged.channel,
    });

    if (merged.replies > 0) {
      repliesSection.push({
        lead_id: lead.id,
        name: lead.name || lead.email || "",
        email: lead.email || "",
        last_reply_at: merged.last_activity,
        last_reply_preview: merged.last_preview,
        thread_id: merged.thread_id ?? null,
        conversation_id: merged.conversation_id ?? null,
        channel: merged.channel,
      });
    }
  }

  const delivered = Math.max(automation.delivered_count || 0, messagesSent);
  const opened = automation.opened_count || 0;

  const round4 = (n: number): number => Math.round(n * 10000) / 10000;
  const repliesTotal = recipients.reduce((sum, r) => sum + r.replies, 0);

  // Most recent replies first (ISO string compare; nulls last).
  const descStr = (a: string, b: string): number => (a < b ? 1 : a > b ? -1 : 0);
  repliesSection.sort((a, b) => descStr(a.last_reply_at || "", b.last_reply_at || ""));
  // Replied leads grouped together, then by most-recent activity
  recipients.sort((a, b) => {
    const ak = (a.replies || 0) > 0 ? 0 : 1;
    const bk = (b.replies || 0) > 0 ? 0 : 1;
    if (ak !== bk) return bk - ak;
    return descStr(a.last_activity || "", b.last_activity || "");
  });

  return {
    contacts_sent: contactsSent,
    messages_sent: messagesSent,
    replied_lead_count: repliedLeadCount,
    reply_rate: round4(contactsSent ? repliedLeadCount / contactsSent : 0),
    conversion_rate: round4(contactsSent ? converted / contactsSent : 0),
    converted,
    delivered,
    opened,
    delivered_rate: round4(contactsSent ? delivered / contactsSent : 0),
    open_rate: round4(contactsSent ? opened / contactsSent : 0),
    positive_replies: positiveReplyCount,
    replies_total: repliesTotal,
    recipients,
    replies_section: repliesSection,
  };
}

/** Per-automation aggregates. */
export async function computeAutomationRecipientStats(
  env: Env, automation: AutomationRow, orgId: number,
): Promise<AutomationRecipientStats> {
  const leads = safeJson<AutomationLead[]>(automation.leads, []);
  // Two bulk queries instead of 2N. This is what fixes the perceived hang
  // on /api/automations/:id/details for automations with many leads.
  const [emailMap, smsMap] = await Promise.all([
    loadEmailRepliesByLead(env, automation),
    loadSmsRepliesByLead(env, automation, orgId, leads),
  ]);
  const messagesSent = await countOutboundMessagesSent(env, automation, orgId);
  const converted = await countConvertedLeads(env, automation, orgId);
  return assembleAutomationStats(automation, leads, emailMap, smsMap, messagesSent, converted);
}

// ---------------------------------------------------------------------------
// Batch path: compute stats for MANY automations of one org with a fixed number
// of org-wide reads instead of ~4-5 queries per automation. Used by the automation
// list and the org summary, where a 10-automation page was firing 40-50 D1
// queries and brushing the free-tier 50-subrequest cap.
// ---------------------------------------------------------------------------

interface OrgEmailInboundRow extends EmailInboundRow {
  thread_id: number | null;
}

/** Append `value` to the array stored at `key`, creating it on first use. */
function pushInto<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

/**
 * Per-automation stats for every automation in `automations` (assumed to belong to
 * `orgId`), keyed by automation id. Runs five org-wide reads total regardless of
 * how many automations there are. Output for each automation is identical to
 * `computeAutomationRecipientStats`.
 */
export async function computeAutomationStatsBatch(
  env: Env, automations: AutomationRow[], orgId: number,
): Promise<Map<number, AutomationRecipientStats>> {
  const out = new Map<number, AutomationRecipientStats>();
  if (automations.length === 0) return out;

  const threadIds = automations
    .map((c) => (c.thread_id == null ? null : Number(c.thread_id)))
    .filter((t): t is number => t != null && Number.isFinite(t));
  const threadPh = threadIds.map(() => "?").join(",");

  // Org-wide reads in parallel. Email is scoped by the automation threads;
  // SMS + appointments are scoped by org and sliced per-automation in memory.
  // The scheduled_message sent-count gives the REAL number of messages actually
  // sent per automation (status='sent'), so SENT/DELIVERED reflect reality
  // instead of being floored to the lead count.
  const [emailRows, emailOutRows, smsInRows, smsOutRows, apptRows, sentRows] = await Promise.all([
    threadIds.length
      ? queryAll<OrgEmailInboundRow>(
          env.D1DB,
          `SELECT m.thread_id, m.body, m.message_date, m.created_at, m.meta, m.sender_email
             FROM inbox_messages m
            WHERE m.thread_id IN (${threadPh})
              AND m.direction = 'inbound'
              AND LOWER(COALESCE(m.channel, 'email')) = 'email'`,
          ...threadIds,
        )
      : Promise.resolve([] as OrgEmailInboundRow[]),
    threadIds.length
      ? queryAll<{ thread_id: number; n: number }>(
          env.D1DB,
          `SELECT m.thread_id AS thread_id, COUNT(m.id) AS n
             FROM inbox_messages m
            WHERE m.thread_id IN (${threadPh}) AND m.direction = 'outbound'
            GROUP BY m.thread_id`,
          ...threadIds,
        )
      : Promise.resolve([] as Array<{ thread_id: number; n: number }>),
    queryAll<SmsInboundRow>(
      env.D1DB,
      `SELECT m.body, m.created_at, ct.phone_number_e164, c.id AS conversation_id
         FROM sms_message m
         JOIN sms_conversation c ON c.id = m.conversation_id
         JOIN sms_contact ct ON ct.id = c.contact_id
        WHERE c.org_id = ? AND m.direction = 'inbound'`,
      orgId,
    ),
    queryAll<{ phone_number_e164: string; created_at: string | null }>(
      env.D1DB,
      `SELECT ct.phone_number_e164, m.created_at
         FROM sms_message m
         JOIN sms_conversation c ON c.id = m.conversation_id
         JOIN sms_contact ct ON ct.id = c.contact_id
        WHERE c.org_id = ? AND m.direction = 'outbound'`,
      orgId,
    ),
    queryAll<{ lead_id: number; created_at: string | null }>(
      env.D1DB,
      `SELECT lead_id, created_at FROM lead_appointment
        WHERE org_id = ? AND COALESCE(status, '') <> 'cancelled'`,
      orgId,
    ),
    queryAll<{ automation_id: number; sent: number }>(
      env.D1DB,
      `SELECT automation_id, COUNT(*) AS sent
         FROM scheduled_message
        WHERE org_id = ? AND status = 'sent' AND automation_id IS NOT NULL
        GROUP BY automation_id`,
      orgId,
    ),
  ]);
  // Real messages-sent per automation (status='sent'). Delivery isn't tracked
  // separately on scheduled_message, so DELIVERED mirrors real SENT here.
  const sentByAutomation = new Map<number, number>();
  for (const r of sentRows) sentByAutomation.set(Number(r.automation_id), Number(r.sent));

  // Still-pending (queued) rows per automation. pending=0 with messages_sent>0
  // means the campaign has fully drained -> the UI can show "Completed" instead
  // of a perpetual "Running"/"Live".
  const pendingRows = await queryAll<{ automation_id: number; pending: number }>(
    env.D1DB,
    `SELECT automation_id, COUNT(*) AS pending
       FROM scheduled_message
      WHERE org_id = ? AND status = 'scheduled' AND automation_id IS NOT NULL
      GROUP BY automation_id`,
    orgId,
  );
  const pendingByAutomation = new Map<number, number>();
  for (const r of pendingRows) pendingByAutomation.set(Number(r.automation_id), Number(r.pending));

  // Bucket org-wide rows by their natural key.
  const emailByThread = new Map<number, OrgEmailInboundRow[]>();
  for (const r of emailRows) {
    if (r.thread_id == null) continue;
    pushInto(emailByThread, Number(r.thread_id), r);
  }
  const emailOutByThread = new Map<number, number>();
  for (const r of emailOutRows) emailOutByThread.set(Number(r.thread_id), Number(r.n));
  const smsInByPhone = new Map<string, SmsInboundRow[]>();
  for (const r of smsInRows) {
    if (r.phone_number_e164) pushInto(smsInByPhone, r.phone_number_e164, r);
  }
  const smsOutByPhone = new Map<string, Array<string | null>>();
  for (const r of smsOutRows) {
    if (r.phone_number_e164) pushInto(smsOutByPhone, r.phone_number_e164, r.created_at);
  }
  const apptByLead = new Map<number, Array<string | null>>();
  for (const r of apptRows) {
    const id = Number(r.lead_id);
    if (Number.isInteger(id)) pushInto(apptByLead, id, r.created_at);
  }

  for (const automation of automations) {
    const leads = safeJson<AutomationLead[]>(automation.leads, []);
    const cutoff = automation.created_at || null;
    const threadId = automation.thread_id == null ? null : Number(automation.thread_id);

    // Email reply map: thread rows, time-filtered in JS (COALESCE(date, created)).
    const threadRows = threadId != null ? emailByThread.get(threadId) ?? [] : [];
    const emailRowsForAutomation = cutoff
      ? threadRows.filter((r) => {
          const ts = pickMessageTs(r.message_date, r.created_at);
          return ts != null && ts >= cutoff;
        })
      : threadRows;
    const emailMap = aggregateEmailRows(emailRowsForAutomation, threadId);

    // SMS reply map: rows for the automation's (deduped) phones, time-filtered.
    const phoneSet = new Set<string>();
    for (const lead of leads) {
      const phone = tryNormalizeE164(lead.phone);
      if (phone) phoneSet.add(phone);
    }
    const smsRowsForAutomation: SmsInboundRow[] = [];
    for (const phone of phoneSet) {
      const rows = smsInByPhone.get(phone);
      if (!rows) continue;
      for (const r of rows) {
        if (!cutoff || (r.created_at && r.created_at >= cutoff)) smsRowsForAutomation.push(r);
      }
    }
    const smsMap = aggregateSmsRows(smsRowsForAutomation);

    // Outbound count: email on thread (no time filter) + SMS to phones since
    // the automation was created.
    let outbound = 0;
    if (threadId != null) outbound += emailOutByThread.get(threadId) ?? 0;
    if (phoneSet.size > 0 && cutoff) {
      for (const phone of phoneSet) {
        const stamps = smsOutByPhone.get(phone);
        if (!stamps) continue;
        for (const ts of stamps) if (ts && ts >= cutoff) outbound += 1;
      }
    }
    // REAL messages sent for this automation (from scheduled_message status='sent').
    // Fall back to the materialized outbound count only if no scheduled rows exist
    // (legacy automations). No longer floored to lead count, so SENT/DELIVERED are
    // the true number of messages that went out, not the audience size.
    const messagesSent = sentByAutomation.get(Number(automation.id)) ?? outbound;

    // Conversions: appointment rows for the automation's (deduped) lead ids since
    // the automation was created.
    let converted = 0;
    for (const id of new Set(leadIdsFromAutomation(leads))) {
      const stamps = apptByLead.get(id);
      if (!stamps) continue;
      for (const ts of stamps) if (!cutoff || (ts && ts >= cutoff)) converted += 1;
    }

    out.set(
      Number(automation.id),
      {
        ...assembleAutomationStats(automation, leads, emailMap, smsMap, messagesSent, converted),
        pending: pendingByAutomation.get(Number(automation.id)) ?? 0,
      },
    );
  }
  return out;
}

export interface OrgAutomationSummary {
  // UI stat cards
  appointments_booked: number;
  appointments_booked_this_week: number;
  conversations: number;
  conversations_active: number;
  positive_replies: number;
  pipeline_value: number;
  total_automations: number;
  has_automations: boolean;
  // Automation-scoped extras (table)
  contacts_reached: number;
  reply_rate: number;
  automation_appointments: number;
  automation_positive_replies: number;
}

/** SQLite CURRENT_TIMESTAMP-compatible UTC string ("YYYY-MM-DD HH:MM:SS"). */
function sqlTimestamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Top KPI row for the Automations / Automations page (matches UI stat cards).
 */
export async function computeOrgAutomationSummary(env: Env, orgId: number): Promise<OrgAutomationSummary> {
  const now = new Date();
  const weekAgo = sqlTimestamp(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const monthAgo = sqlTimestamp(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

  const automations = await queryAll<AutomationRow>(
    env.D1DB,
    `SELECT * FROM automation WHERE org_id = ? AND is_archived = 0`,
    String(orgId),
  );

  // -- Appointments Booked --
  const apptRow = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(id) AS n FROM lead_appointment
      WHERE org_id = ? AND COALESCE(status, '') <> 'cancelled'`,
    orgId,
  );
  const appointmentsBooked = apptRow?.n ?? 0;

  const apptWeekRow = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(id) AS n FROM lead_appointment
      WHERE org_id = ? AND COALESCE(status, '') <> 'cancelled' AND created_at >= ?`,
    orgId, weekAgo,
  );
  const appointmentsBookedThisWeek = apptWeekRow?.n ?? 0;

  // -- Conversations (threads with inbound) --
  const convRow = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(DISTINCT t.id) AS n
       FROM thread t
       JOIN inbox i ON t.inbox_id = i.id
       JOIN inbox_messages m ON m.thread_id = t.id
      WHERE i.org_id = ? AND m.direction = 'inbound'`,
    orgId,
  );
  const conversations = convRow?.n ?? 0;

  // -- Active conversations (2-way email threads in last 30 days) --
  const emailActiveRow = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM (
        SELECT DISTINCT m.thread_id FROM inbox_messages m
          JOIN thread t ON m.thread_id = t.id
          JOIN inbox i ON t.inbox_id = i.id
         WHERE i.org_id = ? AND m.direction = 'inbound'
           AND COALESCE(m.message_date, m.created_at) >= ?
      ) inb
      JOIN (
        SELECT DISTINCT m.thread_id FROM inbox_messages m
          JOIN thread t ON m.thread_id = t.id
          JOIN inbox i ON t.inbox_id = i.id
         WHERE i.org_id = ? AND m.direction = 'outbound'
           AND COALESCE(m.message_date, m.created_at) >= ?
      ) outb ON inb.thread_id = outb.thread_id`,
    orgId, monthAgo, orgId, monthAgo,
  );

  // -- Active conversations (2-way SMS in last 30 days) --
  const smsActiveRow = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM (
        SELECT DISTINCT conversation_id FROM sms_message
         WHERE org_id = ? AND direction = 'inbound' AND created_at >= ?
      ) si
      JOIN (
        SELECT DISTINCT conversation_id FROM sms_message
         WHERE org_id = ? AND direction = 'outbound' AND created_at >= ?
      ) so ON si.conversation_id = so.conversation_id`,
    orgId, monthAgo, orgId, monthAgo,
  );
  const conversationsActive = (emailActiveRow?.n ?? 0) + (smsActiveRow?.n ?? 0);

  // -- Positive Replies (high-intent inbound email) --
  const inboundMeta = await queryAll<{ meta: string | null }>(
    env.D1DB,
    `SELECT m.meta FROM inbox_messages m
       JOIN thread t ON m.thread_id = t.id
       JOIN inbox i ON t.inbox_id = i.id
      WHERE i.org_id = ? AND m.direction = 'inbound'`,
    orgId,
  );
  let positiveReplies = 0;
  for (const row of inboundMeta) {
    if (isHighIntent(row.meta)) positiveReplies += 1;
  }

  // -- Pipeline Value --
  const org = await queryFirst<{ average_deal_price: number | null; commission_percent: number | null }>(
    env.D1DB,
    `SELECT average_deal_price, commission_percent FROM organization WHERE id = ?`,
    orgId,
  );
  const pipelineLeads = await queryAll<PipelineLead>(
    env.D1DB,
    `SELECT id, status, estimated_price FROM lead WHERE org_id = ?`,
    orgId,
  );
  const pipeline = calculatePipelineValue(pipelineLeads, {
    averageDealPrice: org?.average_deal_price ?? DEFAULT_AVERAGE_DEAL_PRICE,
    commissionPercent: org?.commission_percent ?? DEFAULT_COMMISSION_PERCENT,
  });

  // -- Automation-scoped extras (table) --
  let contactsReached = 0;
  let repliedLeads = 0;
  let automationPositive = 0;
  let automationAppointments = 0;
  const statsByAutomation = await computeAutomationStatsBatch(env, automations, orgId);
  for (const stats of statsByAutomation.values()) {
    contactsReached += stats.contacts_sent;
    repliedLeads += stats.replied_lead_count;
    automationPositive += stats.positive_replies;
    automationAppointments += stats.converted;
  }

  const replyRate = contactsReached ? repliedLeads / contactsReached : 0;
  const round4 = (n: number): number => Math.round(n * 10000) / 10000;

  return {
    appointments_booked: appointmentsBooked,
    appointments_booked_this_week: appointmentsBookedThisWeek,
    conversations,
    conversations_active: conversationsActive,
    positive_replies: positiveReplies,
    pipeline_value: Math.round(pipeline.total * 100) / 100,
    total_automations: automations.length,
    has_automations: automations.length > 0,
    contacts_reached: contactsReached,
    reply_rate: round4(replyRate),
    automation_appointments: automationAppointments,
    automation_positive_replies: automationPositive,
  };
}
