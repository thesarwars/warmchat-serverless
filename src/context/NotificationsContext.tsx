import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { createWcSocket, type WcSocket } from "@/utils/wsClient";
import { routeForNotification } from "@/utils/notificationRoute";
import {
  getStoredAuthSession,
  subscribeToAuthSession,
} from "@/utils/authSession";
import { playNotificationSound } from "@/utils/sounds";
import { baseURL as API_BASE } from "@/helpers/api";
import { queryClient } from "@/helpers/queryClient";
import type { MeBootstrap } from "@/helpers/backend";
import { InboxReplyToast } from "@/components/notifications/InboxReplyToast";
import { TestCallToast } from "@/components/notifications/TestCallToast";
import { NimbusToast } from "@/components/notifications/NimbusToast";
import {
  NotificationsContext,
  type NotificationItem,
  type NotificationsContextValue,
} from "./useNotifications";

/**
 * Single source of truth for in-app notifications. Owns:
 *   - a WebSocket handle to /api/calling/ws42. This shares one underlying socket
 *     with CallingContext (same URL → same per-user UserSocketDO, which
 *     broadcasts every event to all listeners), so the two contexts no longer
 *     open duplicate connections. See createWcSocket's ref-counting.
 *   - the recent notifications list + unread count.
 *   - sound + browser-tab badge + window-title prefix.
 *   - the in-app reply toast for sms_inbound / email_inbound events.
 */

const TITLE_BASE = (typeof document !== "undefined" && document.title) || "WarmChats";

// The Nimbus toasts (generic notification + inbound reply) bring their own card
// chrome and a mascot head that peeks above it, so strip Sonner's default white
// card (background / border / shadow / padding) while keeping its width + slot.
// Tailwind v4 important modifier is a suffix (`p-0!`), not the v3 prefix.
const NIMBUS_TOAST_CLASSNAMES = {
  toast: "bg-transparent! border-0! shadow-none! p-0! ring-0! overflow-visible!",
} as const;

interface NotifPrefs {
  notify_in_app_toast: boolean;
  notify_sound: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  notify_in_app_toast: true,
  notify_sound: true,
};

function buildSocketUrl(): string {
  const override = import.meta.env.VITE_CALLING_WS_URL as string | undefined;
  if (override && override.length > 0) {
    return `${override.replace(/\/+$/, "")}/api/calling/ws42`;
  }
  if (typeof window === "undefined") return "";
  const isHttps = window.location.protocol === "https:";
  const protocol = isHttps ? "wss" : "ws";
  const port = isHttps ? "" : ":3333";
  return `${protocol}://${window.location.hostname}${port}/api/calling/ws42`;
}

function updateTitleBadge(unread: number): void {
  if (typeof document === "undefined") return;
  document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${TITLE_BASE}` : TITLE_BASE;
}

function setAppBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0 && nav.setAppBadge) {
      void nav.setAppBadge(count);
    } else if (nav.clearAppBadge) {
      void nav.clearAppBadge();
    }
  } catch {
    /* ignore */
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const sessionActiveRef = useRef<boolean>(
    typeof window !== "undefined" ? !!getStoredAuthSession().userId : false,
  );
  const socketRef = useRef<WcSocket | null>(null);
  const prefsRef = useRef<NotifPrefs>(DEFAULT_PREFS);
  // The conversation (lead id) the inbox is currently showing, if any. Set by the
  // inbox on open/close so an incoming notification for the thread the user is
  // already reading doesn't pop a redundant reply toast - it is silently marked
  // read instead (they can see + reply right there in the thread).
  const activeConversationRef = useRef<number | null>(null);
  // Live toast ids keyed by the conversation (contact) they belong to, so opening
  // that conversation can dismiss any reply toast still on screen for it.
  const toastsByContactRef = useRef<Map<number, string | number>>(new Map());
  const setActiveConversation = useCallback((id: number | null) => {
    activeConversationRef.current = id;
    if (id != null) {
      const tid = toastsByContactRef.current.get(id);
      if (tid != null) {
        toast.dismiss(tid);
        toastsByContactRef.current.delete(id);
      }
    }
  }, []);

  // Ids we've already surfaced as an in-app toast (whether via the live WS event
  // or the safety-net poll), so the two paths never double-pop the same one.
  const surfacedToastIdsRef = useRef<Set<number>>(new Set());
  // Set once the first notifications fetch lands. The initial fetch seeds the
  // surfaced set WITHOUT toasting (we don't want a backlog of 40 to pop on
  // login); only notifications that appear AFTER that get a poll-driven toast.
  const initializedRef = useRef<boolean>(false);
  // showReplyToast is defined below pollRefresh, so the poll reaches it through
  // this ref (kept current by an effect) rather than a forward reference.
  const showReplyToastRef = useRef<(n: NotificationItem) => void>(() => {});

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastLiveNotification, setLastLiveNotification] =
    useState<NotificationItem | null>(null);

  // Keep title + OS badge in sync with unreadCount.
  useEffect(() => {
    updateTitleBadge(unreadCount);
    setAppBadge(unreadCount);
  }, [unreadCount]);

  const fetchInitial = useCallback(async () => {
    if (!sessionActiveRef.current) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/notifications?limit=40`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { items?: NotificationItem[] };
      const fresh = json.items ?? [];
      setItems(fresh);
      setUnreadCount(fresh.filter((n) => !n.is_read).length);
      // Seed the surfaced set so the poll never toasts the existing backlog -
      // only notifications that arrive after this baseline get a fallback toast.
      for (const n of fresh) surfacedToastIdsRef.current.add(n.id);
      initializedRef.current = true;
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  // Quiet background refresh (no loading spinner) used by the safety-net poll
  // below. The bell normally updates instantly off the live WS "notification"
  // event, but if that event is ever missed (a brief socket drop, or a notify()
  // emitted from a context whose socket isn't connected - e.g. the /admin/debug
  // "simulate inbound reply"), this poll guarantees the persisted notification
  // still surfaces within the interval instead of only on reload / tab focus.
  const pollRefresh = useCallback(async () => {
    if (!sessionActiveRef.current || (typeof document !== "undefined" && document.hidden)) return;
    try {
      const res = await fetch(`${API_BASE}/notifications?limit=40`, { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as { items?: NotificationItem[] };
      const fresh = json.items ?? [];
      setItems(fresh);
      setUnreadCount(fresh.filter((n) => !n.is_read).length);

      // Fallback toast: if the live WS "notification" event was missed (a brief
      // socket drop, hibernation race, or a notify() whose emit didn't reach
      // this tab), the bell updates here but no toast ever fired. Surface one
      // for any genuinely-new, unread, recent notification we haven't shown yet
      // - deduped against the live path via surfacedToastIdsRef. Bounded to
      // recent rows so a backlog that accrued while the tab was closed can't
      // burst a wall of toasts.
      if (!initializedRef.current) {
        for (const n of fresh) surfacedToastIdsRef.current.add(n.id);
        initializedRef.current = true;
        return;
      }
      const RECENT_MS = 3 * 60_000;
      const nowMs = Date.now();
      const toSurface = fresh
        .filter((n) => !n.is_read && !surfacedToastIdsRef.current.has(n.id))
        .filter((n) => n.contact_id == null || n.contact_id !== activeConversationRef.current)
        .filter((n) => {
          const t = n.created_at ? Date.parse(n.created_at) : NaN;
          return Number.isNaN(t) || nowMs - t <= RECENT_MS;
        })
        .sort((a, b) => a.id - b.id) // oldest first so they stack in arrival order
        .slice(-3); // cap the burst
      for (const n of toSurface) {
        surfacedToastIdsRef.current.add(n.id);
        const normalized: NotificationItem = {
          ...n,
          data:
            typeof n.data === "string"
              ? (() => { try { return JSON.parse(n.data as unknown as string); } catch { return null; } })()
              : (n.data ?? null),
        };
        if (prefsRef.current.notify_sound) playNotificationSound(normalized.kind);
        showReplyToastRef.current(normalized);
      }
    } catch {
      /* ignore - the next tick retries */
    }
  }, []);

  const fetchPrefs = useCallback(async () => {
    if (!sessionActiveRef.current) return;
    // Hot path: the dashboard's /api/bootstrap/me already includes these
    // toggles. Reuse the cached payload so the provider doesn't fire a
    // second /me/notification-settings request on cold load.
    const bootstrap = queryClient.getQueryData<MeBootstrap>(["me_bootstrap"]);
    const cached = bootstrap?.notification_settings;
    if (cached) {
      prefsRef.current = {
        notify_in_app_toast: cached.notify_in_app_toast !== false,
        notify_sound: cached.notify_sound !== false,
      };
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/me/notification-settings`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as Partial<NotifPrefs> & Record<string, unknown>;
      prefsRef.current = {
        notify_in_app_toast: data.notify_in_app_toast !== false,
        notify_sound: data.notify_sound !== false,
      };
    } catch {
      /* keep defaults */
    }
  }, []);

  // Fire-and-forget persist of a single notification's read state. The optimistic
  // list/count updates are owned by the callers below so they can stay idempotent.
  const persistRead = useCallback((id: number) => {
    fetch(`${API_BASE}/notifications/${id}/read`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {
      /* ignore */
    });
  }, []);

  // Idempotent: only decrements the unread badge when the row was actually
  // unread, so calling it twice for the same id (e.g. toast dismiss + swipe)
  // can't drive the count negative.
  const markRead = useCallback(
    async (id: number) => {
      let wasUnread = false;
      setItems((prev) =>
        prev.map((n) => {
          if (n.id === id && !n.is_read) {
            wasUnread = true;
            return { ...n, is_read: true };
          }
          return n;
        }),
      );
      if (wasUnread) {
        setUnreadCount((n) => Math.max(0, n - 1));
        persistRead(id);
      }
    },
    [persistRead],
  );

  const markReadByContact = useCallback(
    (contactId: number) => {
      const ids: number[] = [];
      setItems((prev) =>
        prev.map((n) => {
          if (n.contact_id === contactId && !n.is_read) {
            ids.push(n.id);
            return { ...n, is_read: true };
          }
          return n;
        }),
      );
      if (ids.length > 0) {
        setUnreadCount((n) => Math.max(0, n - ids.length));
        for (const id of ids) persistRead(id);
      }
    },
    [persistRead],
  );

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await fetch(`${API_BASE}/notifications/read-all`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
  }, []);

  const dismissLocal = useCallback((id: number) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const showReplyToast = useCallback(
    (notif: NotificationItem) => {
      if (!prefsRef.current.notify_in_app_toast) return;
      // Keep toasts clear of the bottom-right Chatbase bubble: top-right on
      // desktop, full-width from the top on mobile (Sonner spans the toast
      // edge-to-edge at its mobile breakpoint).
      const isMobile =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 600px)").matches;

      // Test incoming-call alert (from the Settings "Send test call" button):
      // render a self-contained Answer / Decline toast. Real calls ring through
      // the separate Telnyx/IncomingCallModal pipeline, so this is scoped to the
      // test marker and never starts a real WebRTC leg.
      const data = (notif.data || {}) as Record<string, unknown>;
      if (
        (notif.kind === "call_incoming" || notif.kind === "call_missed") &&
        data.test === true
      ) {
        toast.custom(
          (t) => (
            <TestCallToast
              fromName={(data.lead_name as string) || "WarmChats test"}
              fromNumber={(data.from_number as string) || "Unknown"}
              onResolved={() => {
                void markRead(notif.id);
                toast.dismiss(t);
              }}
            />
          ),
          {
            duration: 30_000,
            position: isMobile ? "top-center" : "top-right",
            onDismiss: () => void markRead(notif.id),
            onAutoClose: () => void markRead(notif.id),
          },
        );
        return;
      }

      const supportsReply =
        notif.kind === "sms_inbound" || notif.kind === "email_inbound";
      if (!supportsReply) {
        // Generic in-app notification - render as the Nimbus companion card
        // (head peeking out, light-blue palette) with an Open action.
        const kind = notif.kind || "";
        const isUrgent =
          data.urgent === true ||
          kind.includes("missed") ||
          kind.includes("escalat") ||
          kind.includes("urgent") ||
          kind === "payment_failed";
        const genericId = toast.custom(
          (t) => (
            <NimbusToast
              title={notif.title}
              message={notif.body}
              urgent={isUrgent}
              ctaLabel="Open"
              onCta={() => {
                void markRead(notif.id);
                toast.dismiss(t);
                navigate(routeForNotification(notif));
              }}
              onDismiss={() => {
                void markRead(notif.id);
                toast.dismiss(t);
              }}
            />
          ),
          {
            duration: 8000,
            position: isMobile ? "top-center" : "top-right",
            // Drop Sonner's default white card chrome - the Nimbus card brings
            // its own background/border/shadow and the head peeks out above it.
            classNames: NIMBUS_TOAST_CLASSNAMES,
            onDismiss: () => void markRead(notif.id),
            onAutoClose: () => void markRead(notif.id),
          },
        );
        if (notif.contact_id != null) toastsByContactRef.current.set(notif.contact_id, genericId);
        return;
      }
      const replyId = toast.custom(
        (t) => (
          <InboxReplyToast
            notification={notif}
            onOpen={() => {
              void markRead(notif.id);
              toast.dismiss(t);
              navigate(routeForNotification(notif));
            }}
            onSent={() => {
              void markRead(notif.id);
              toast.dismiss(t);
              // Nudge an open inbox thread to pull in the reply we just sent
              // (the inbox is a separate route, so it listens for this event).
              window.dispatchEvent(
                new CustomEvent("wc:inbox-refresh", {
                  detail: { contactId: notif.contact_id },
                }),
              );
            }}
            onDismiss={() => {
              void markRead(notif.id);
              toast.dismiss(t);
            }}
          />
        ),
        {
          duration: 30_000,
          position: isMobile ? "top-center" : "top-right",
          classNames: NIMBUS_TOAST_CLASSNAMES,
          // Swipe-to-dismiss / auto-close also clear the notification.
          onDismiss: () => void markRead(notif.id),
          onAutoClose: () => void markRead(notif.id),
        },
      );
      if (notif.contact_id != null) toastsByContactRef.current.set(notif.contact_id, replyId);
    },
    [markRead, navigate],
  );

  const handleIncoming = useCallback(
    (raw: unknown) => {
      const notif = raw as NotificationItem | undefined;
      if (!notif || typeof notif !== "object") return;

      // Normalize: server emits with `data` as a JSON string when the row was
      // round-tripped through SQLite; the REST list parses it. Do both.
      const normalized: NotificationItem = {
        ...notif,
        data:
          typeof notif.data === "string"
            ? (() => {
                try { return JSON.parse(notif.data as unknown as string); } catch { return null; }
              })()
            : (notif.data ?? null),
        is_read: !!notif.is_read,
      };

      // Is the user already viewing this conversation in the inbox? Then mark the
      // notification read on arrival and suppress the toast/sound - they can see
      // and reply to it in the open thread; a pop-up reply box would be redundant
      // (and previously let them reply to a thread they were already on).
      const viewingThisConvo =
        normalized.contact_id != null && normalized.contact_id === activeConversationRef.current;

      setItems((prev) => {
        // Dedupe: if we already have this id (e.g. from initial fetch race),
        // skip the prepend.
        if (prev.some((n) => n.id === normalized.id)) return prev;
        const next = [{ ...normalized, is_read: normalized.is_read || viewingThisConvo }, ...prev];
        return next.slice(0, 80);
      });
      if (!normalized.is_read && !viewingThisConvo) {
        setUnreadCount((n) => n + 1);
      }
      // Surface to subscribers (the inbox live-refreshes the open thread off this).
      setLastLiveNotification(normalized);

      // A new inbound message changes the inbox unread count - refresh the
      // sidebar badge (and any other inbox_contacts consumer) right away instead
      // of waiting for its 2-minute staleTime / the next inbox visit.
      if (normalized.kind === "sms_inbound" || normalized.kind === "email_inbound") {
        queryClient.invalidateQueries({ queryKey: ["inbox_contacts"] });
      }

      if (viewingThisConvo) {
        // Persist the read so the bell stays clean across reloads.
        void persistRead(normalized.id);
        return;
      }

      if (prefsRef.current.notify_sound) {
        playNotificationSound(normalized.kind);
      }
      // Record that this id has been surfaced so the safety-net poll doesn't
      // re-toast it.
      surfacedToastIdsRef.current.add(normalized.id);
      showReplyToast(normalized);
    },
    [showReplyToast, persistRead],
  );

  // Keep the ref the poll uses current (showReplyToast is memoised above).
  useEffect(() => {
    showReplyToastRef.current = showReplyToast;
  }, [showReplyToast]);

  const connectSocket = useCallback(() => {
    if (socketRef.current) return;
    const url = buildSocketUrl();
    if (!url) return;
    const socket = createWcSocket(url);
    socket.on("notification", handleIncoming);
    socket.on("auth_error", () => socket.disconnect());
    socketRef.current = socket;
  }, [handleIncoming]);

  const tearDownSocket = useCallback(() => {
    try { socketRef.current?.disconnect(); } catch { /* noop */ }
    socketRef.current = null;
  }, []);

  // Defer the initial pulls (prefs + last 40 notifications) off the dashboard's
  // first-paint critical path: they don't gate any visible UI and were costing
  // two of the ~19 requests the dashboard fires on cold load.
  const scheduleInitialFetches = useCallback(() => {
    if (typeof window === "undefined") return;
    const run = () => {
      if (!sessionActiveRef.current) return;
      void fetchPrefs();
      void fetchInitial();
    };
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    if (typeof ric === "function") ric(run, { timeout: 1500 });
    else setTimeout(run, 600);
  }, [fetchInitial, fetchPrefs]);

  // Wire up on login / tear down on logout.
  useEffect(() => {
    if (!sessionActiveRef.current) return;
    scheduleInitialFetches();
    connectSocket();
    return () => {
      tearDownSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    return subscribeToAuthSession(() => {
      const active = !!getStoredAuthSession().userId;
      if (active === sessionActiveRef.current) return;
      sessionActiveRef.current = active;
      if (active) {
        scheduleInitialFetches();
        connectSocket();
      } else {
        tearDownSocket();
        setItems([]);
        setUnreadCount(0);
      }
    });
  }, [connectSocket, scheduleInitialFetches, tearDownSocket]);

  // When the tab regains focus, pull again so we don't miss anything that
  // landed during a brief WS disconnect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocus = () => {
      if (sessionActiveRef.current) void fetchInitial();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchInitial]);

  // Safety-net poll: reconcile the bell with the server every 45s so a missed
  // live event (socket blip, or a notify() whose emit didn't reach this tab)
  // still appears without a manual reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => { void pollRefresh(); }, 45_000);
    return () => window.clearInterval(id);
  }, [pollRefresh]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unreadCount,
      loading,
      refresh: fetchInitial,
      markRead,
      markReadByContact,
      markAllRead,
      dismissLocal,
      lastLiveNotification,
      setActiveConversation,
    }),
    [
      items,
      unreadCount,
      loading,
      fetchInitial,
      markRead,
      markReadByContact,
      markAllRead,
      dismissLocal,
      lastLiveNotification,
      setActiveConversation,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}
