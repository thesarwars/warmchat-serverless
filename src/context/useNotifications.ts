import { createContext, useContext } from "react";

type NotifKind =
  | "sms_inbound"
  | "email_inbound"
  | "call_incoming"
  | "call_missed"
  | "voicemail"
  | "appointment_booked"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "appointment_reminder"
  | "automation_completed"
  | "message_failed"
  | "message_bounced"
  | "dlc_status_changed"
  | "payment_failed"
  | "subscription_changed"
  | "quota_warning"
  | "system";

type NotifSeverity = "info" | "success" | "warning" | "error";

export interface NotificationItem {
  id: number;
  kind: NotifKind | string;
  channel: "sms" | "email" | "call" | "system" | null;
  contact_id: number | null;
  conversation_id: number | null;
  appointment_id: number | null;
  severity: NotifSeverity | string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string | null;
}

export interface NotificationsContextValue {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  /**
   * Mark every unread notification tied to a contact read at once - used when
   * the inbox opens that contact's conversation (seeing the message clears it).
   */
  markReadByContact: (contactId: number) => void;
  markAllRead: () => Promise<void>;
  dismissLocal: (id: number) => void;
  /**
   * The most recent notification pushed over the WebSocket. The inbox watches
   * this to live-refresh the open thread without polling, regardless of whether
   * the optional VITE_INBOX_WS_URL socket is configured.
   */
  lastLiveNotification: NotificationItem | null;
  /**
   * Tell the notifications layer which conversation (lead id) the inbox is
   * currently showing, or null when none. An incoming notification for the
   * active conversation is silently marked read instead of popping a redundant
   * reply toast. The inbox calls this on open / close.
   */
  setActiveConversation: (contactId: number | null) => void;
}

export const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used inside <NotificationsProvider>");
  }
  return ctx;
}
