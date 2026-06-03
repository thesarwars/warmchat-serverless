import type { NotificationItem } from "@/context/useNotifications";

/**
 * Single source of truth for "where does clicking this notification go".
 * Used by the bell-panel NotificationCenter and the in-app reply toast so they
 * never drift apart.
 *
 * Inbound message kinds resolve to the unified inbox focused on the lead WITH a
 * `channel` hint so the inbox opens on the matching SMS/email tab (and flashes
 * the latest inbound message). These take precedence over the server-provided
 * `data.path` (which only carries `/inbox?lead=X`, no channel).
 */
export function routeForNotification(notif: NotificationItem): string {
  if (
    notif.contact_id &&
    (notif.kind === "sms_inbound" || notif.kind === "email_inbound")
  ) {
    const channel = notif.kind === "email_inbound" ? "email" : "sms";
    return `/inbox?lead=${notif.contact_id}&channel=${channel}`;
  }
  const data = (notif.data || {}) as { path?: string };
  if (data.path) return data.path;
  if (notif.kind.startsWith("appointment_") && notif.appointment_id)
    return `/appointments/${notif.appointment_id}`;
  if (notif.kind === "payment_failed" || notif.kind === "subscription_changed")
    return "/settings?tab=billing";
  if (notif.kind === "dlc_status_changed") return "/settings?tab=workspace";
  return "/inbox";
}
