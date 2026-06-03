const INBOX_NOTIF_PREFS_KEY = "wc_inbox_notification_prefs_v1";

export type InboxNotifPrefs = {
  desktopEmail: boolean;
  desktopSms: boolean;
  inAppToast: boolean;
};

export function loadNotifPrefs(): InboxNotifPrefs {
  try {
    const raw = localStorage.getItem(INBOX_NOTIF_PREFS_KEY);
    if (!raw) {
      return { desktopEmail: true, desktopSms: true, inAppToast: true };
    }
    const parsed = JSON.parse(raw) as Partial<InboxNotifPrefs>;
    return {
      desktopEmail: parsed.desktopEmail !== false,
      desktopSms: parsed.desktopSms !== false,
      inAppToast: parsed.inAppToast !== false,
    };
  } catch {
    return { desktopEmail: true, desktopSms: true, inAppToast: true };
  }
}
