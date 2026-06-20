/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryAll, queryFirst, execute, nowIso } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";

/**
 * GET /api/inbox/contacts/:leadId/messages -> { contact, email_messages, sms_messages, unified_messages }
 * Also flips is_read=true on any unread messages returned.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const leadId = Number(params.leadId);
  if (!Number.isInteger(leadId)) return error("Invalid lead id", 400);

  const lead = await queryFirst<{
    id: number; org_id: number | null; name: string | null;
    first_name: string | null; last_name: string | null;
    email: string | null; phone: string | null; status: string | null;
    company: string | null; property_address: string | null; price_range: string | null;
    notes: string | null;
    email_notifications_enabled: number; sms_notifications_enabled: number;
    lead_type: string | null; intent: string | null; ai_status: string | null;
    timezone: string | null; area: string | null; timeline: string | null;
    pre_approved: number | null; motivation: string | null; occupancy_status: string | null;
    financing_status: string | null; interest_level: string | null;
    bedrooms: number | null; bathrooms: number | null;
    property_type: string | null; seller_price_expectations: string | null;
    qualification_step: number | null; qualification_status: string | null;
    ai_summary: string | null; lead_score: number | null; next_best_action: string | null;
    sms_opt_out: number | null; email_opt_out: number | null; sms_consent_status: string | null;
  }>(
    env.D1DB,
    `SELECT id, org_id, name, first_name, last_name, email, phone, status,
            company, property_address, price_range, notes,
            email_notifications_enabled, sms_notifications_enabled,
            lead_type, intent, ai_status, timezone, area, timeline,
            pre_approved, motivation, occupancy_status, financing_status,
            interest_level, bedrooms, bathrooms, property_type, seller_price_expectations,
            qualification_step, qualification_status,
            ai_summary, lead_score, next_best_action,
            sms_opt_out, email_opt_out, sms_consent_status
       FROM lead WHERE id = ?`,
    leadId,
  );
  if (!lead) return error("Lead not found", 404);
  if (!lead.org_id || !(await isOrgMember(env, user.id, lead.org_id))) {
    return error("Forbidden", 403);
  }

  // ---- Email threads for this lead ----
  const threadRows = await queryAll<{ thread_id: number }>(
    env.D1DB,
    `SELECT DISTINCT im.thread_id
       FROM inbox_messages im JOIN thread t ON im.thread_id=t.id JOIN inbox i ON t.inbox_id=i.id
      WHERE i.org_id = ? AND (
        LOWER(im.sender_email) = LOWER(?) OR LOWER(im.to_email) = LOWER(?)
      )`,
    lead.org_id, lead.email ?? "", lead.email ?? "",
  );
  const threadIds = threadRows.map((r) => r.thread_id);

  type EmailMsg = {
    id: number; thread_id: number; direction: string; body: string; subject: string;
    attachments: string | null; sender_name: string | null; sender_email: string | null;
    message_date: string | null; created_at: string | null; is_read: number;
    delivery_status: string | null; sent_at: string | null; delivered_at: string | null;
    bounced_at: string | null; opened_at: string | null; error_message: string | null;
    sent_by_ai: number | null; campaign_name: string | null;
  };
  let emailMessages: EmailMsg[] = [];
  let latestEmailThreadId: number | null = null;
  let latestEmailSubject: string | null = null;
  let latestEmailAt: string | null = null;
  const leadEmail = (lead.email ?? "").trim().toLowerCase();
  if (threadIds.length && leadEmail) {
    const placeholders = threadIds.map(() => "?").join(",");
    // CRITICAL: filter to messages actually TO or FROM this lead's address, not
    // the whole thread. Campaign emails share one thread across hundreds of
    // recipients, so selecting the whole thread leaked every other lead's emails
    // into this lead's conversation. Outbound to the lead -> to_email matches;
    // the lead's inbound reply -> sender_email matches.
    emailMessages = await queryAll<EmailMsg>(
      env.D1DB,
      `SELECT im.id, im.thread_id, im.direction, im.body, im.subject, im.attachments,
              im.sender_name, im.sender_email, im.message_date, im.created_at, im.is_read,
              im.delivery_status, im.sent_at, im.delivered_at, im.bounced_at, im.opened_at,
              im.error_message, im.sent_by_ai, a.name AS campaign_name
         FROM inbox_messages im
         LEFT JOIN automation a ON a.id = im.automation_id
        WHERE im.thread_id IN (${placeholders})
          AND (LOWER(im.to_email) = ? OR LOWER(im.sender_email) = ?)
        ORDER BY COALESCE(im.message_date, im.created_at) ASC, im.id ASC`,
      ...threadIds, leadEmail, leadEmail,
    );
    // Mark only THIS lead's inbound messages as read (not the shared thread's).
    await execute(
      env.D1DB,
      `UPDATE inbox_messages SET is_read = 1
        WHERE thread_id IN (${placeholders})
          AND (LOWER(to_email) = ? OR LOWER(sender_email) = ?) AND is_read = 0`,
      ...threadIds, leadEmail, leadEmail,
    );

    // Latest = this lead's own most recent email (list is ordered ASC).
    const lastMsg = emailMessages[emailMessages.length - 1];
    if (lastMsg) {
      latestEmailThreadId = lastMsg.thread_id;
      latestEmailSubject = lastMsg.subject;
      latestEmailAt = lastMsg.message_date || lastMsg.created_at;
    }
  }

  // ---- SMS conversation for this lead ----
  const digits = (lead.phone ?? "").replace(/\D/g, "");
  let conversation: { id: number; last_message_at: string | null } | null = null;
  if (lead.phone) {
    conversation = await queryFirst<{ id: number; last_message_at: string | null }>(
      env.D1DB,
      `SELECT c.id, c.last_message_at FROM sms_conversation c
         JOIN sms_contact sc ON c.contact_id=sc.id
        WHERE c.org_id=? AND sc.phone_number_e164=? LIMIT 1`,
      lead.org_id, lead.phone,
    );
    if (!conversation && digits.length >= 10) {
      const suffix = `%${digits.slice(-10)}`;
      conversation = await queryFirst<{ id: number; last_message_at: string | null }>(
        env.D1DB,
        `SELECT c.id, c.last_message_at FROM sms_conversation c
           JOIN sms_contact sc ON c.contact_id=sc.id
          WHERE c.org_id=? AND sc.phone_number_e164 LIKE ?
          ORDER BY c.last_message_at DESC LIMIT 1`,
        lead.org_id, suffix,
      );
    }
  }

  type SmsMsg = {
    id: number; conversation_id: number; direction: string; body: string;
    attachments: string | null; created_at: string;
    status: string | null; sent_at: string | null; delivered_at: string | null;
    error_code: string | null; sent_by_ai: number | null; campaign_name: string | null;
  };
  let smsMessages: SmsMsg[] = [];
  if (conversation) {
    smsMessages = await queryAll<SmsMsg>(
      env.D1DB,
      `SELECT sm.id, sm.conversation_id, sm.direction, sm.body, sm.attachments, sm.created_at,
              sm.status, sm.sent_at, sm.delivered_at, sm.error_code, sm.sent_by_ai,
              a.name AS campaign_name
         FROM sms_message sm
         LEFT JOIN automation a ON a.id = sm.automation_id
        WHERE sm.conversation_id = ? ORDER BY sm.created_at ASC, sm.id ASC`,
      conversation.id,
    );
    await execute(
      env.D1DB,
      `UPDATE sms_message SET is_read = 1
        WHERE conversation_id = ? AND direction='inbound' AND is_read = 0`,
      conversation.id,
    );
  }

  // ---- Appointments ----
  const appointmentRows = await queryAll<{
    id: number; appointment_type: string; starts_at: string; status: string;
    meeting_type: string; notes: string | null; external_meeting_url: string | null;
    confirmed_at: string | null; created_at: string;
    sms_confirmation_sent_at: string | null;
    email_confirmation_sent_at: string | null;
  }>(
    env.D1DB,
    `SELECT id, appointment_type, starts_at, status, meeting_type, notes,
            external_meeting_url, confirmed_at, created_at,
            sms_confirmation_sent_at, email_confirmation_sent_at
       FROM lead_appointment WHERE lead_id = ? AND org_id = ? ORDER BY starts_at ASC`,
    leadId, lead.org_id,
  );

  const emailOut = emailMessages.map((m) => ({
    id: `email-${m.id}`,
    message_id: m.id,
    thread_id: m.thread_id,
    channel: "email" as const,
    direction: m.direction,
    body: m.body,
    subject: m.subject,
    attachments: m.attachments ? safeJson(m.attachments, []) : [],
    timestamp: m.message_date || m.created_at,
    display_time: m.message_date || m.created_at,
    sender_name: m.sender_name,
    sender_email: m.sender_email,
    delivery_status: m.delivery_status,
    sent_at: m.sent_at,
    delivered_at: m.delivered_at,
    bounced_at: m.bounced_at,
    opened_at: m.opened_at,
    error_message: m.error_message,
    sent_by_ai: m.sent_by_ai === 1,
    campaign_name: m.campaign_name,
  }));
  const smsOut = smsMessages.map((m) => ({
    id: `sms-${m.id}`,
    message_id: m.id,
    conversation_id: m.conversation_id,
    channel: "sms" as const,
    direction: m.direction,
    body: m.body,
    subject: null,
    attachments: m.attachments ? safeJson(m.attachments, []) : [],
    timestamp: m.created_at,
    display_time: m.created_at,
    delivery_status: m.status,
    sent_at: m.sent_at,
    delivered_at: m.delivered_at,
    error_code: m.error_code,
    sent_by_ai: m.sent_by_ai === 1,
    campaign_name: m.campaign_name,
  }));
  // Appointments render as their own card on the client (AppointmentThreadCard)
  // driven by the `appointments` array below - they must not appear inside
  // `unified_messages` as a fake "message" or the chat renders the literal
  // "{type} - {meeting_type}" string in a bubble.
  const apptOut = appointmentRows.map((a) => ({
    id: a.id,
    lead_id: leadId,
    appointment_type: a.appointment_type,
    starts_at: a.starts_at,
    status: a.status,
    meeting_type: a.meeting_type,
    notes: a.notes,
    external_meeting_url: a.external_meeting_url,
    confirmed_at: a.confirmed_at,
    created_at: a.created_at,
    sms_confirmation_sent_at: a.sms_confirmation_sent_at,
    email_confirmation_sent_at: a.email_confirmation_sent_at,
  }));

  const unified = [...emailOut, ...smsOut].sort(
    (a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""),
  );

  // Last activity
  let lastChannel: "email" | "sms" | null = null;
  let lastAt: string | null = null;
  if (latestEmailAt) { lastChannel = "email"; lastAt = latestEmailAt; }
  if (conversation?.last_message_at && (!lastAt || conversation.last_message_at > lastAt)) {
    lastChannel = "sms"; lastAt = conversation.last_message_at;
  }
  const contact = {
    id: lead.id, name: lead.name,
    first_name: lead.first_name, last_name: lead.last_name,
    email: lead.email, phone: lead.phone, stage: lead.status || "New",
    company: lead.company, property_address: lead.property_address, price_range: lead.price_range,
    tags: [] as string[], notes: lead.notes,
    last_activity_at: lastAt,
    last_activity_channel: lastChannel,
    last_activity_label: lastAt && lastChannel
      ? `${lastChannel === "sms" ? "SMS" : "Email"} · ${new Date(lastAt).toLocaleString("en-US")}`
      : null,
    preview: "",
    email_notifications_enabled: Boolean(lead.email_notifications_enabled),
    sms_notifications_enabled: Boolean(lead.sms_notifications_enabled),
    lead_type: lead.lead_type, intent: lead.intent, ai_status: lead.ai_status,
    timezone: lead.timezone, area: lead.area, timeline: lead.timeline,
    pre_approved: lead.pre_approved == null ? null : Boolean(lead.pre_approved),
    motivation: lead.motivation, occupancy_status: lead.occupancy_status,
    financing_status: lead.financing_status, interest_level: lead.interest_level,
    bedrooms: lead.bedrooms, bathrooms: lead.bathrooms,
    property_type: lead.property_type, seller_price_expectations: lead.seller_price_expectations,
    qualification_step: lead.qualification_step, qualification_status: lead.qualification_status,
    ai_summary: lead.ai_summary, lead_score: lead.lead_score, next_best_action: lead.next_best_action,
    sms_opt_out: Boolean(lead.sms_opt_out), email_opt_out: Boolean(lead.email_opt_out),
    sms_consent_status: lead.sms_consent_status,
    email_thread_ids: threadIds,
    latest_email_thread_id: latestEmailThreadId,
    latest_email_subject: latestEmailSubject,
    sms_conversation_id: conversation?.id ?? null,
    email_unread_count: 0, sms_unread_count: 0, total_unread_count: 0,
    has_email_history: emailMessages.length > 0,
    has_sms_history: smsMessages.length > 0,
  };
  // Silence unused-var lint for nowIso (kept for API parity if you re-enable read tracking).
  void nowIso;

  return json({
    contact,
    email_messages: emailOut,
    sms_messages: smsOut,
    unified_messages: unified,
    appointments: apptOut,
  });
};

function safeJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
