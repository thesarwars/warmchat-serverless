/// <reference types="@cloudflare/workers-types" />
import { execute, queryFirst } from "./db.ts";
import { sendPushToUser } from "./webPush.ts";

/**
 * Structural minimum the helper needs. Lets both Pages (functions/_shared/env.ts)
 * and the cron Worker (workers/cron/env.ts) pass their own Env without sharing
 * a single concrete type.
 */
export interface NotifyEnv {
  D1DB: D1Database;
  GATEWAY?: Fetcher;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_CONTACT_EMAIL?: string;
}

/**
 * notify(env, {...}) is the SINGLE entry point for every server-side
 * notification. It owns three jobs:
 *
 *   1. Persist a row in `notification` (so the bell + history list show it).
 *   2. Broadcast to the user's open tabs via the gateway Durable Object so
 *      they get a live toast / sound / badge update without polling.
 *   3. Send a Web Push to the user's registered browsers so out-of-app
 *      desktop / Android / installed-PWA iOS notifications arrive.
 *
 * The helper respects per-user notification preferences (columns on `user`),
 * so callers can fire-and-forget for every event source.
 */

export type NotifyKind =
  | "sms_inbound"
  | "email_inbound"
  | "call_incoming"
  | "call_missed"
  | "voicemail"
  | "appointment_booked"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "appointment_reminder"
  | "ai_reply_sent"
  | "automation_completed"
  | "message_failed"
  | "message_bounced"
  | "dlc_status_changed"
  | "payment_failed"
  | "subscription_changed"
  | "quota_warning"
  | "system";

export type NotifySeverity = "info" | "success" | "warning" | "error";

export interface NotifyInput {
  userId: number;
  orgId?: number | undefined;
  kind: NotifyKind;
  title: string;
  body?: string | undefined;
  channel?: "sms" | "email" | "call" | "system" | undefined;
  contactId?: number | undefined;
  conversationId?: number | undefined;
  appointmentId?: number | undefined;
  severity?: NotifySeverity | undefined;
  /** Free-form metadata: routing path, IDs, anything the SW + client can use. */
  data?: Record<string, unknown> | undefined;
  /** Delivery overrides; default is "all three channels, respecting prefs". */
  persist?: boolean | undefined;
  emitLive?: boolean | undefined;
  pushOut?: boolean | undefined;
  /**
   * When true, always send the OS push even if the user has a live WS
   * session. Used by the Settings "Send test notification" button - the
   * user is explicitly verifying out-of-app delivery and doesn't want us
   * to skip the push just because their browser tab is in front.
   */
  forcePush?: boolean | undefined;
}

interface UserPrefs {
  notify_sms_inbound: number;
  notify_email_inbound: number;
  notify_calls: number;
  notify_appointments: number;
  notify_billing: number;
  notify_system: number;
  notify_ai_reply: number;
  notify_via_web_push: number;
  notify_via_mobile_push: number;
  notify_in_app_toast: number;
}

interface NotificationRow {
  id: number;
  user_id: number;
  org_id: number | null;
  kind: string;
  channel: string | null;
  contact_id: number | null;
  conversation_id: number | null;
  appointment_id: number | null;
  severity: string;
  title: string;
  body: string | null;
  data: string | null;
  is_read: number;
  read_at: string | null;
  created_at: string;
}

// Map kind -> the per-category pref column that gates the entire event.
// If the column is 0 we drop the notification entirely (no row, no push, no WS).
function categoryPrefColumn(
  kind: NotifyKind,
): keyof UserPrefs | null {
  switch (kind) {
    case "sms_inbound":
      return "notify_sms_inbound";
    case "email_inbound":
    case "message_bounced":
    case "message_failed":
      return "notify_email_inbound";
    case "call_incoming":
    case "call_missed":
    case "voicemail":
      return "notify_calls";
    case "appointment_booked":
    case "appointment_rescheduled":
    case "appointment_cancelled":
    case "appointment_reminder":
      return "notify_appointments";
    case "ai_reply_sent":
      return "notify_ai_reply";
    case "payment_failed":
    case "subscription_changed":
    case "quota_warning":
      return "notify_billing";
    case "dlc_status_changed":
    case "automation_completed":
    case "system":
      return "notify_system";
    default:
      return null;
  }
}

async function loadPrefs(env: NotifyEnv, userId: number): Promise<UserPrefs | null> {
  return queryFirst<UserPrefs>(
    env.D1DB,
    `SELECT notify_sms_inbound, notify_email_inbound, notify_calls,
            notify_appointments, notify_billing, notify_system, notify_ai_reply,
            notify_via_web_push, notify_via_mobile_push, notify_in_app_toast
       FROM "user" WHERE id = ?`,
    userId,
  );
}

/**
 * Broadcasts an event to the user's open WebSocket sessions via the gateway
 * Worker. Fire-and-forget; failure here must not block persistence or push.
 */
async function emitLive(env: NotifyEnv, userId: number, event: string, data: unknown): Promise<void> {
  if (!env.GATEWAY) return;
  try {
    await env.GATEWAY.fetch(`http://gw/do/userSocket/user:${userId}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data }),
    });
  } catch (err) {
    console.warn("[notify] gateway emit failed", err);
  }
}

// NOTE: We deliberately do NOT probe "is the user online anywhere" before
// pushing. That per-account check used to suppress the OS push for EVERY
// device whenever any tab was open, so a backgrounded second device (phone)
// got nothing. Push now always fans out to all devices; each device's
// service worker silences its own alert if ITS window is focused.

export async function notify(env: NotifyEnv, input: NotifyInput): Promise<NotificationRow | null> {
  const {
    userId,
    orgId,
    kind,
    title,
    body,
    channel,
    contactId,
    conversationId,
    appointmentId,
    severity = "info",
    data,
    persist = true,
    emitLive: doEmit = true,
    pushOut = true,
    forcePush = false,
  } = input;

  // 1) Pref gate. If the user disabled this whole category, do nothing.
  const prefs = await loadPrefs(env, userId);
  if (prefs) {
    const col = categoryPrefColumn(kind);
    if (col && !prefs[col]) return null;
  }

  // 2) Persist.
  let row: NotificationRow | null = null;
  if (persist) {
    const dataStr = data ? JSON.stringify(data) : null;
    const ins = await execute(
      env.D1DB,
      `INSERT INTO notification
         (user_id, org_id, kind, channel, contact_id, conversation_id,
          appointment_id, severity, title, body, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      orgId ?? null,
      kind,
      channel ?? null,
      contactId ?? null,
      conversationId ?? null,
      appointmentId ?? null,
      severity,
      title,
      body ?? null,
      dataStr,
    );
    const id = Number(ins.meta.last_row_id);
    row = await queryFirst<NotificationRow>(
      env.D1DB,
      `SELECT id, user_id, org_id, kind, channel, contact_id, conversation_id,
              appointment_id, severity, title, body, data, is_read, read_at, created_at
         FROM notification WHERE id = ?`,
      id,
    );
  }

  // The payload shipped to live tabs + service worker is the same shape so
  // the client only has to learn one type.
  const payload = row ?? {
    id: 0,
    user_id: userId,
    org_id: orgId ?? null,
    kind,
    channel: channel ?? null,
    contact_id: contactId ?? null,
    conversation_id: conversationId ?? null,
    appointment_id: appointmentId ?? null,
    severity,
    title,
    body: body ?? null,
    data: data ? JSON.stringify(data) : null,
    is_read: 0,
    read_at: null,
    created_at: new Date().toISOString(),
  };

  // 3) Live in-app via WS.
  if (doEmit) {
    await emitLive(env, userId, "notification", payload);
  }

  // 4) Out-of-app push. ALWAYS fan out to every registered device the user
  //    has (respecting their web-push pref). We no longer suppress the push
  //    just because the user has a tab open somewhere - that previously
  //    meant only the foreground device got anything. Instead each device's
  //    service worker silences its own alert when ITS window is focused (the
  //    in-app toast handles that one), while every backgrounded device still
  //    rings. `forcePush` is retained for API compatibility but is now a
  //    no-op since the default already pushes everywhere.
  void forcePush;
  if (pushOut && prefs?.notify_via_web_push) {
    try {
      await sendPushToUser(env, userId, JSON.stringify(payload));
    } catch (err) {
      console.warn("[notify] push fan-out failed", err);
    }
  }

  return row;
}
