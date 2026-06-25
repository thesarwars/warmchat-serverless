/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst, execute, nowIso } from "./db.ts";
import { bumpLeadActivity } from "./leadActivity.ts";
import { mockTelnyxSendSms } from "./mockSendApi.ts";
import { smsBlockReason, appendComplianceFooter } from "./smsCompliance.ts";
import { dispatchOutboundEmail } from "./outboundEmail.ts";
import { incrementUsage } from "./usageCounter.ts";
import { normalizeE164 } from "./phone.ts";
import { notify } from "./notify.ts";
import { dispatchZapierEvent } from "./zapierDispatch.ts";

/**
 * Sends the SMS / email "you're booked for..." messages after an appointment
 * is persisted. Returns per-channel status strings the SPA already understands
 * ("sent", "skipped_*", or "failed:..."). Also persists the outbound messages
 * into sms_message / inbox_messages so they show up in the conversation.
 */

export type ConfirmationResult = {
  sms: string | null;
  email: string | null;
};

interface LeadRow {
  id: number;
  org_id: number | null;
  name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  sms_notifications_enabled: number;
  email_notifications_enabled: number;
  sms_opt_out: number;
}

interface AppointmentRow {
  id: number;
  appointment_type: string;
  starts_at: string;
  meeting_type: string;
  notes: string | null;
  external_meeting_url: string | null;
}

interface UserRow {
  id: number;
  name: string | null;
  gmail_user_name: string | null;
  telnyx_phone_number: string | null;
}

function meetingTypeLabel(mt: string): string {
  switch (mt) {
    case "in_person":
      return "In person";
    case "phone":
      return "Phone";
    case "google_meet":
      return "Google Meet";
    default:
      return mt;
  }
}

export type ConfirmationKind = "booked" | "rescheduled" | "cancelled";

function buildConfirmationBody(
  lead: LeadRow,
  appt: AppointmentRow,
  kind: ConfirmationKind,
): string {
  const when = new Date(appt.starts_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
  const greet = (lead.first_name || lead.name || "there").trim();
  const lines = [`Hi ${greet},`, ""];

  if (kind === "cancelled") {
    lines.push(
      `Your appointment has been cancelled: ${appt.appointment_type}`,
      `Originally scheduled: ${when} UTC`,
      "Reply to this thread if you'd like to rebook.",
    );
    return lines.join("\n");
  }

  const header =
    kind === "rescheduled"
      ? `Your appointment has been rescheduled: ${appt.appointment_type}`
      : `Your appointment is confirmed: ${appt.appointment_type}`;
  lines.push(
    header,
    `When: ${when} UTC`,
    `Appointment: ${meetingTypeLabel(appt.meeting_type)}`,
  );
  if (appt.external_meeting_url) {
    lines.push(`Address: ${appt.external_meeting_url}`);
  }
  if (appt.notes) {
    lines.push("", `Notes: ${appt.notes}`);
  }
  lines.push("", "Reply to this thread if you need to make a change.");
  return lines.join("\n");
}

async function persistOutboundSms(
  env: Env,
  orgId: number,
  toE164: string,
  body: string,
  providerMessageId: string,
): Promise<void> {
  let contact = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM sms_contact WHERE org_id = ? AND phone_number_e164 = ? LIMIT 1`,
    orgId,
    toE164,
  );
  if (!contact) {
    const ins = await execute(
      env.D1DB,
      `INSERT INTO sms_contact (org_id, phone_number_e164) VALUES (?, ?)`,
      orgId,
      toE164,
    );
    contact = { id: Number(ins.meta.last_row_id) };
  }
  let conv = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM sms_conversation WHERE org_id = ? AND contact_id = ? LIMIT 1`,
    orgId,
    contact.id,
  );
  if (!conv) {
    const ins = await execute(
      env.D1DB,
      `INSERT INTO sms_conversation (org_id, contact_id, last_message_at) VALUES (?, ?, ?)`,
      orgId,
      contact.id,
      nowIso(),
    );
    conv = { id: Number(ins.meta.last_row_id) };
  }
  await execute(
    env.D1DB,
    `INSERT INTO sms_message
       (org_id, conversation_id, direction, body, status, provider_message_sid, created_at, is_read)
     VALUES (?, ?, 'outbound', ?, 'sent', ?, ?, 1)`,
    orgId,
    conv.id,
    body,
    providerMessageId,
    nowIso(),
  );
  await execute(
    env.D1DB,
    `UPDATE sms_conversation SET last_message_at = ? WHERE id = ?`,
    nowIso(),
    conv.id,
  );
}

async function persistOutboundEmail(
  env: Env,
  orgId: number,
  userId: number,
  userName: string | null,
  leadId: number,
  toEmail: string,
  subject: string,
  body: string,
  fromEmail: string | null,
  providerMessageId: string | null,
  trackingToken: string | null,
): Promise<void> {
  let inbox = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM inbox WHERE org_id = ? AND channel = 'email' LIMIT 1`,
    orgId,
  );
  if (!inbox) {
    const ins = await execute(
      env.D1DB,
      `INSERT INTO inbox (name, channel, org_id, created_at) VALUES ('Email', 'email', ?, ?)`,
      orgId,
      nowIso(),
    );
    inbox = { id: Number(ins.meta.last_row_id) };
  }
  const thread = await execute(
    env.D1DB,
    `INSERT INTO thread (subject, inbox_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    subject,
    inbox.id,
    nowIso(),
    nowIso(),
  );
  const threadId = Number(thread.meta.last_row_id);
  await execute(
    env.D1DB,
    `INSERT INTO inbox_messages
       (thread_id, sender_id, sender_name, sender_email, subject, body, direction, channel,
        to_email, message_id, created_at, message_date, is_read,
        delivery_status, sent_at, tracking_token, lead_id)
     VALUES (?, ?, ?, ?, ?, ?, 'outbound', 'email', ?, ?, ?, ?, 1, 'sent', ?, ?, ?)`,
    threadId,
    userId,
    userName,
    fromEmail,
    subject,
    body,
    toEmail,
    providerMessageId,
    nowIso(),
    nowIso(),
    nowIso(),
    trackingToken,
    leadId,
  );
  await execute(
    env.D1DB,
    `INSERT INTO thread_lead_assignments (thread_id, lead_id, assigned_at) VALUES (?, ?, ?)`,
    threadId,
    leadId,
    nowIso(),
  );
  await bumpLeadActivity(env.D1DB, leadId, nowIso());
}

export async function sendAppointmentConfirmations(
  env: Env,
  args: {
    appointmentId: number;
    leadId: number;
    actorUserId: number;
    sendSms: boolean;
    sendEmail: boolean;
    kind?: ConfirmationKind;
  },
): Promise<ConfirmationResult> {
  const kind: ConfirmationKind = args.kind || "booked";
  const result: ConfirmationResult = { sms: null, email: null };

  const appt = await queryFirst<AppointmentRow>(
    env.D1DB,
    `SELECT id, appointment_type, starts_at, meeting_type, notes, external_meeting_url
       FROM lead_appointment WHERE id = ? AND lead_id = ?`,
    args.appointmentId,
    args.leadId,
  );
  const lead = await queryFirst<LeadRow>(
    env.D1DB,
    `SELECT id, org_id, name, first_name, email, phone,
            sms_notifications_enabled, email_notifications_enabled, sms_opt_out
       FROM lead WHERE id = ?`,
    args.leadId,
  );
  if (!appt || !lead) {
    return { sms: "skipped", email: "skipped" };
  }
  const user = await queryFirst<UserRow>(
    env.D1DB,
    `SELECT id, name, gmail_user_name, telnyx_phone_number FROM "user" WHERE id = ?`,
    args.actorUserId,
  );
  const agentName = (user?.gmail_user_name || user?.name || "Your Agent").trim();
  const body = buildConfirmationBody(lead, appt, kind);
  const now = nowIso();

  // ---- SMS ----
  if (args.sendSms) {
    if (!lead.sms_notifications_enabled) {
      result.sms = "skipped_notifications_disabled";
    } else if (lead.sms_opt_out) {
      result.sms = "skipped_opt_out";
    } else if (!(lead.phone || "").trim()) {
      result.sms = "skipped_no_phone";
    } else if (!user?.telnyx_phone_number) {
      result.sms = "failed:SMS not connected for this account";
    } else {
      const block = await smsBlockReason(env, args.actorUserId);
      if (block) {
        result.sms = `failed:${block}`;
      } else {
        let to: string;
        try {
          to = normalizeE164(lead.phone || "");
        } catch (e) {
          result.sms = `failed:${(e as Error).message}`;
          to = "";
        }
        if (to) {
          // Appointment confirmations are 1:1 transactional sends - exempt
          // from the marketing footer + AI disclosure under CTIA. The helper
          // returns the body unchanged for "transactional".
          const smsBody = appendComplianceFooter(body, { kind: "transactional" });
          const sent = await mockTelnyxSendSms(env, user.telnyx_phone_number, to, smsBody, {
            orgId: lead.org_id ?? null,
            leadId: lead.id,
          });
          if (!sent.ok) {
            result.sms = `failed:${sent.error.message}`;
          } else {
            result.sms = "sent";
            if (lead.org_id) {
              await persistOutboundSms(env, lead.org_id, to, smsBody, sent.data.id);
              await incrementUsage(env, lead.org_id, "sms", 1).catch(() => undefined);
            }
            await execute(
              env.D1DB,
              `UPDATE lead_appointment SET sms_confirmation_sent_at = ?, updated_at = ? WHERE id = ?`,
              now,
              now,
              appt.id,
            );
          }
        }
      }
    }
  } else {
    result.sms = "skipped";
  }

  // ---- Email ----
  if (args.sendEmail) {
    if (!lead.email_notifications_enabled) {
      result.email = "skipped_notifications_disabled";
    } else if (!(lead.email || "").trim()) {
      result.email = "skipped_no_email";
    } else {
      const subject =
        kind === "cancelled"
          ? "Appointment cancelled"
          : kind === "rescheduled"
            ? "Appointment rescheduled"
            : "Appointment confirmation";
      const dispatch = await dispatchOutboundEmail(env, {
        userId: args.actorUserId,
        to: lead.email!.trim(),
        subject,
        body,
        leadId: lead.id,
        senderName: agentName,
      });
      if (!dispatch.ok) {
        result.email = `failed:${dispatch.error}`;
      } else {
        result.email = "sent";
        if (lead.org_id) {
          await persistOutboundEmail(
            env,
            lead.org_id,
            args.actorUserId,
            user?.name || null,
            lead.id,
            lead.email!.trim(),
            dispatch.subject,
            dispatch.body,
            dispatch.fromEmail || null,
            dispatch.providerMessageId || null,
            dispatch.trackingToken,
          );
          await incrementUsage(env, lead.org_id, "email", 1).catch(() => undefined);
        }
        await execute(
          env.D1DB,
          `UPDATE lead_appointment SET email_confirmation_sent_at = ?, updated_at = ? WHERE id = ?`,
          now,
          now,
          appt.id,
        );
      }
    }
  } else {
    result.email = "skipped";
  }

  // Bell-list + push for the agent: an appointment was booked/rescheduled/cancelled.
  // Independent of whether the SMS/email to the lead actually went out.
  try {
    const leadLabel = (lead.name && lead.name.trim()) || (lead.first_name && lead.first_name.trim()) || "a lead";
    const startsAt = appt.starts_at ? new Date(appt.starts_at).toLocaleString() : "(time tbd)";
    const titleByKind = {
      booked: `Appointment booked with ${leadLabel}`,
      rescheduled: `Appointment rescheduled with ${leadLabel}`,
      cancelled: `Appointment cancelled with ${leadLabel}`,
    } as const;
    const kindToNotifyKind = {
      booked: "appointment_booked",
      rescheduled: "appointment_rescheduled",
      cancelled: "appointment_cancelled",
    } as const;
    const severity = kind === "cancelled" ? "warning" : "success";
    await notify(env, {
      userId: args.actorUserId,
      orgId: lead.org_id ?? undefined,
      kind: kindToNotifyKind[kind],
      channel: "system",
      contactId: lead.id,
      appointmentId: appt.id,
      severity,
      title: titleByKind[kind],
      body: startsAt,
      data: {
        path: `/inbox?lead=${lead.id}`,
        appointment_id: appt.id,
        starts_at: appt.starts_at,
      },
    });
  } catch (err) {
    console.warn("[appointment-notify] failed", err);
  }

  // Instant "Appointment Booked" trigger for any subscribed Zap (booked only).
  if (kind === "booked" && lead.org_id != null) {
    await dispatchZapierEvent(env, lead.org_id, "appointment.booked", {
      appointment_id: appt.id,
      lead_id: lead.id,
      starts_at: appt.starts_at,
      appointment_type: appt.appointment_type,
      meeting_type: appt.meeting_type,
      lead_name: lead.name ?? lead.first_name ?? null,
      lead_email: lead.email ?? null,
      lead_phone: lead.phone ?? null,
    });
  }

  return result;
}
