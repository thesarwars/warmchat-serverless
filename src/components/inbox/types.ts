import type { UploadedAttachment } from "../../utils/messageAttachments";
import type { InboxAppointmentRecord } from "@/helpers/backend";

export type GmailStatus =
  | "loading"
  | "connected"
  | "reconnect_required"
  | "not_connected";
export type DomainStatus = "loading" | "not_connected" | "registered" | "verified";
export type ViewTab = "unified" | "sms" | "email";
export type ComposeChannel = "sms" | "email";
export type SenderType = "personal" | "business";

export type InboxContact = {
  id: number;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  stage?: string | null;
  company?: string | null;
  property_address?: string | null;
  price_range?: string | null;
  tags?: string[];
  notes?: string | null;
  last_activity_at?: string | null;
  last_activity_channel?: "email" | "sms" | null;
  last_activity_label?: string | null;
  preview?: string | null;
  email_notifications_enabled?: boolean;
  sms_notifications_enabled?: boolean;
  email_thread_ids?: number[];
  latest_email_thread_id?: number | null;
  latest_email_subject?: string | null;
  sms_conversation_id?: number | null;
  email_unread_count?: number;
  sms_unread_count?: number;
  total_unread_count?: number;
  /**
   * True when the most recent message in the conversation is inbound (the lead
   * spoke last), so the agent still owes a reply. Independent of read state -
   * reading the message does NOT clear this, only sending a reply does. Drives
   * the "Needs Reply" filter chip + badge.
   */
  needs_reply?: boolean;
  has_email_history?: boolean;
  has_sms_history?: boolean;
  timezone?: string | null;
  timezone_source?: string | null;
  lead_type?: string | null;
  intent?: string | null;
  ai_status?: string | null;
  status?: string | null;
  area?: string | null;
  qualification_status?: string | null;
  qualification_step?: number | null;
  timeline?: string | null;
  pre_approved?: boolean | null;
  motivation?: string | null;
  occupancy_status?: string | null;
  financing_status?: string | null;
  interest_level?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  property_type?: string | null;
  seller_price_expectations?: string | null;
  /**
   * Compliance flags driven by lead.sms_opt_out / lead.email_opt_out. The
   * inbox header, right panel, and compose row read these to render the
   * "SMS Opted Out" / "Email Unsubscribed" badge and to disable the
   * matching send button.
   */
  sms_opt_out?: boolean | null;
  email_opt_out?: boolean | null;
};

export type ContactMessage = {
  id: string;
  message_id: number | string | null;
  thread_id?: number | null;
  conversation_id?: number | null;
  channel: "email" | "sms" | "appointment";
  direction: "inbound" | "outbound" | "system";
  body?: string | null;
  subject?: string | null;
  attachments?: UploadedAttachment[];
  timestamp?: string | null;
  display_time?: string | null;
  sender_name?: string | null;
  sender_email?: string | null;
  /**
   * True when this outbound message was composed/sent by the AI agent (set
   * server-side from sms_message.sent_by_ai / inbox_messages.sent_by_ai). Drives
   * the "AI Agent" marker above the bubble. Reliable across SMS + email; the
   * older sender_name heuristic is kept only as a fallback.
   */
  sent_by_ai?: boolean | null;
  /**
   * Name of the automation (campaign / workflow) that sent this outbound
   * message, resolved server-side from the message's automation_id. When set,
   * the inbox tags the bubble with this campaign name instead of the "AI Agent"
   * marker. NULL for conversational-AI + human-composed sends.
   */
  campaign_name?: string | null;
  appointment?: InboxAppointmentRecord;
  // WhatsApp-style delivery status on outbound messages. SMS uses the
  // sms_message.status column (sent/delivered/failed); email uses
  // inbox_messages.delivery_status (sent/delivered/bounced/failed). Email also
  // surfaces opened_at when the recipient loads images.
  delivery_status?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  bounced_at?: string | null;
  opened_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
};

export type ContactFormState = {
  name: string;
  email: string;
  phone: string;
  stage: string;
  price_range: string;
  notes: string;
  tags: string;
  email_notifications_enabled: boolean;
  sms_notifications_enabled: boolean;
  timezone: string;
};

export type LeadLike = {
  id: number;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  price_range?: string | null;
  notes?: string | null;
  tags?: string[];
  email_notifications_enabled?: boolean;
  sms_notifications_enabled?: boolean;
  timezone?: string | null;
  timezone_source?: string | null;
};

export type SendEmailArgs = {
  apiBase: string;
  token: string;
  userId: string;
  orgId: string;
  senderName: string;
  to: string;
  subject: string;
  body: string;
  leadId: number;
  threadId?: number | null;
  senderType: SenderType;
  attachments?: UploadedAttachment[];
  confirmQuietHours?: boolean;
};

export type SendSmsArgs = {
  smsApiBase: string;
  token: string;
  to: string;
  body: string;
  leadId: number;
  attachments?: UploadedAttachment[];
  confirmQuietHours?: boolean;
};

/**
 * Thrown when a send endpoint returns HTTP 409 with `code: "QUIET_HOURS"`.
 * Callers can catch this to prompt the user before retrying with
 * `confirmQuietHours: true`.
 */
export class QuietHoursError extends Error {
  code = "QUIET_HOURS" as const;
  hour: number;
  timezone: string;
  until: string;

  constructor(payload: { hour: number; timezone: string; until: string; message?: string }) {
    super(payload.message ?? `Quiet hours in lead local time (${payload.hour}:00, ${payload.timezone})`);
    this.name = "QuietHoursError";
    this.hour = payload.hour;
    this.timezone = payload.timezone;
    this.until = payload.until;
  }
}
