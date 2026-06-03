import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Mail,
  MessageSquare,
  Phone,
  PhoneMissed,
  Calendar,
  AlertTriangle,
  DollarSign,
  Voicemail,
  CheckCheck,
  Loader2,
  Info,
} from "lucide-react";
import { useNotifications, type NotificationItem } from "@/context/useNotifications";
import { routeForNotification } from "@/utils/notificationRoute";

const KIND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sms_inbound: MessageSquare,
  email_inbound: Mail,
  call_incoming: Phone,
  call_missed: PhoneMissed,
  voicemail: Voicemail,
  appointment_booked: Calendar,
  appointment_rescheduled: Calendar,
  appointment_cancelled: Calendar,
  appointment_reminder: Calendar,
  payment_failed: DollarSign,
  subscription_changed: DollarSign,
  quota_warning: AlertTriangle,
  dlc_status_changed: AlertTriangle,
  automation_completed: CheckCheck,
  message_bounced: AlertTriangle,
  message_failed: AlertTriangle,
  system: Info,
};

const SEVERITY_RING: Record<string, string> = {
  info: "bg-gray-100 text-gray-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  error: "bg-red-50 text-red-600",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

/**
 * Top-nav bell. Click to open a panel anchored beneath the icon. Renders the
 * server's notification feed live-merged with WS-pushed updates.
 */
export function NotificationCenter() {
  const { items, unreadCount, markRead, markAllRead, loading } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current || !buttonRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      if (buttonRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = useMemo(
    () => (tab === "unread" ? items.filter((n) => !n.is_read) : items),
    [tab, items],
  );

  const handleClick = async (n: NotificationItem) => {
    if (!n.is_read) await markRead(n.id);
    setOpen(false);
    navigate(routeForNotification(n));
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Mobile-only scrim. The desktop dropdown uses the document-level
              outside-click handler instead so it doesn't dim the page. */}
          <div
            className="fixed inset-0 z-40 bg-black/30 sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            ref={panelRef}
            className="fixed inset-x-2 top-16 z-50 max-h-[calc(100vh-5rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl ring-1 ring-black/5 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-88 sm:max-w-[calc(100vw-1rem)] sm:origin-top-right"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
              <p className="text-sm font-semibold text-gray-900">Notifications</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={unreadCount === 0}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  Mark all read
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ml-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:hidden"
                  aria-label="Close"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path
                      fillRule="evenodd"
                      d="M4.3 4.3a1 1 0 011.4 0L10 8.6l4.3-4.3a1 1 0 011.4 1.4L11.4 10l4.3 4.3a1 1 0 01-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 01-1.4-1.4L8.6 10 4.3 5.7a1 1 0 010-1.4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex border-b border-gray-100 px-3">
              {(["all", "unread"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`relative -mb-px border-b-2 px-3 py-1.5 text-xs font-medium ${
                    tab === t
                      ? "border-orange-500 text-orange-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t === "all" ? "All" : `Unread${unreadCount ? ` (${unreadCount})` : ""}`}
                </button>
              ))}
            </div>

            <div className="max-h-[calc(100vh-10rem)] overflow-y-auto sm:max-h-104">
              {loading && visible.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : visible.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-gray-500">
                  {tab === "unread" ? "You're all caught up." : "Nothing yet."}
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {visible.map((n) => {
                    const Icon = KIND_ICONS[n.kind] || Info;
                    const ringClass = SEVERITY_RING[n.severity] || SEVERITY_RING.info;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => void handleClick(n)}
                          className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50 ${
                            n.is_read ? "" : "bg-orange-50/40"
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ringClass}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-medium text-gray-900">
                                {n.title}
                              </span>
                              <span className="shrink-0 text-[10px] text-gray-400">
                                {relativeTime(n.created_at)}
                              </span>
                            </span>
                            {n.body && (
                              <span className="mt-0.5 line-clamp-2 block text-xs text-gray-600">
                                {n.body}
                              </span>
                            )}
                          </span>
                          {!n.is_read && (
                            <span
                              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500"
                              aria-hidden
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
