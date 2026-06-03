/* WarmChats web push service worker. Handles `push` events, click routing,
   inline reply actions (Chrome/Android), and the OS badge counter. */

// Build version: replaced at build time by the stampSwBuildVersion Vite
// plugin. Browsers detect SW updates by byte-by-byte diffing this file
// against the cached copy, so the stamp guarantees every deploy ships a
// distinct SW - which is what kicks the "Update available" toast on
// installed PWAs (iOS / Android / desktop).
const BUILD_VERSION = "__BUILD_VERSION__";
self.__BUILD_VERSION__ = BUILD_VERSION;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Minimal pass-through fetch handler. Chrome's PWA install criteria require
// the service worker to register a `fetch` event handler that controls the
// start_url - without this the `beforeinstallprompt` event never fires and
// the "Install app" UI is suppressed. We don't actually cache anything; we
// just let every request hit the network as normal.
self.addEventListener("fetch", () => {
  /* network passthrough */
});

// --- helpers ---------------------------------------------------------------

function parsePushData(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return { title: "WarmChats", body: event.data ? event.data.text() : "" };
  }
}

function routePathFor(kind, data) {
  // Per-kind fallback routing when `data.path` isn't set by the server.
  if (data && typeof data.path === "string" && data.path) return data.path;
  if (!kind) return "/inbox";
  if ((kind === "sms_inbound" || kind === "email_inbound") && data && data.lead_id) return `/inbox?lead=${data.lead_id}`;
  // Calls live inside the Inbox (embedded via ?tab=calls) - there is no
  // standalone /inbox/calls/:id route, so never link there or the click 404s.
  if (kind.startsWith("call_")) return "/inbox?tab=calls";
  if (kind.startsWith("appointment_") && data && data.appointment_id) return `/appointments/${data.appointment_id}`;
  if (kind === "payment_failed" || kind === "subscription_changed") return "/settings?tab=billing";
  if (kind === "dlc_status_changed") return "/settings?tab=workspace";
  if (kind === "quota_warning") return "/settings?tab=billing";
  return "/inbox";
}

function actionsFor(kind) {
  if (kind === "sms_inbound" || kind === "email_inbound") {
    return [
      { action: "reply", type: "text", title: "Reply", placeholder: "Type a reply..." },
      { action: "open", title: "Open" },
    ];
  }
  if (kind === "call_incoming") {
    return [
      { action: "answer", title: "Answer" },
      { action: "decline", title: "Decline" },
    ];
  }
  if (kind === "call_missed") {
    return [{ action: "open", title: "Open" }];
  }
  return [];
}

function nestedData(payload) {
  if (!payload) return {};
  if (payload.data && typeof payload.data === "object") return payload.data;
  if (typeof payload.data === "string") {
    try { return JSON.parse(payload.data) || {}; } catch { return {}; }
  }
  return {};
}

// --- push handler ---------------------------------------------------------

self.addEventListener("push", (event) => {
  const payload = parsePushData(event);
  const kind = payload.kind || "system";
  const data = nestedData(payload);
  // Carry the whole payload through so notificationclick can route + reply.
  const merged = Object.assign({}, payload, { _routeData: data });

  const title = payload.title || "WarmChats";

  event.waitUntil(
    (async () => {
      // Per-device alerting: the server pushes to EVERY registered device.
      // On the device whose WarmChats window is currently focused/visible the
      // in-app toast + chime already handle the alert, so we show the OS
      // notification silently there (userVisibleOnly forces us to show
      // *something*). Every backgrounded device rings normally.
      let hasVisibleClient = false;
      try {
        const wins = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        hasVisibleClient = wins.some((w) => w.visibilityState === "visible");
      } catch {
        /* ignore */
      }

      const options = {
        body: payload.body || "",
        icon: "/web-app-manifest-192x192.png",
        badge: "/favicon-96x96.png",
        data: merged,
        tag: `notif-${payload.id || payload.notification_id || Date.now()}`,
        renotify: !hasVisibleClient,
        silent: hasVisibleClient,
        requireInteraction: kind === "call_incoming" && !hasVisibleClient,
        actions: actionsFor(kind),
        timestamp: payload.created_at ? Date.parse(payload.created_at) : Date.now(),
      };

      await self.registration.showNotification(title, options);
      await bumpBadge();
    })(),
  );
});

async function bumpBadge() {
  try {
    if ("setAppBadge" in self.navigator) {
      // We can't read current value from SW; let the open client sync the
      // exact count when it sees the notification event. For OS-only delivery
      // we approximate with the number of currently shown notifications.
      const notifs = await self.registration.getNotifications();
      await self.navigator.setAppBadge(notifs.length || 1);
    }
  } catch {
    /* ignore */
  }
}

// --- click handler --------------------------------------------------------

self.addEventListener("notificationclick", (event) => {
  const data = (event.notification && event.notification.data) || {};
  const kind = data.kind || "system";
  const routeData = data._routeData || {};
  const path = routePathFor(kind, routeData);
  const action = event.action || "open";
  const replyText = action === "reply" ? (event.reply || "").trim() : "";

  // Empty reply box (user submitted nothing) - just dismiss.
  if (action === "reply" && !replyText) {
    event.notification.close();
    return;
  }

  // Test notifications carry `data.test = true`. Keep their reply purely local
  // (no app focus, no real send) so the Settings "Send test" button can verify
  // the reply box works without firing an SMS / email at a synthetic recipient.
  if (action === "reply" && routeData && routeData.test === true) {
    event.notification.close();
    event.waitUntil(
      self.registration.showNotification("Test reply captured", {
        body: "Looks good - the reply box is working. No message was sent.",
        icon: "/web-app-manifest-192x192.png",
        tag: `notif-test-reply-${Date.now()}`,
        silent: true,
        data: { kind: "system", _routeData: routeData },
      }),
    );
    return;
  }

  // Hand the action to the app: focus an existing window and post it the
  // action (so it sends the reply / answers / declines using its live session,
  // shows the result in the inbox, and surfaces quiet-hours/errors), or open a
  // new window carrying the action in the URL so the freshly-booted app replays
  // it. The service worker can't answer a WebRTC call or reliably send (the
  // send endpoints return HTTP 200 on a quiet-hours block), so everything runs
  // in the app.
  event.notification.close();
  event.waitUntil(
    dispatchActionToApp({ action, kind, path, data: routeData, reply: replyText }),
  );
});

self.addEventListener("notificationclose", () => {
  // Update badge if there are no shown notifications left.
  if (!("setAppBadge" in self.navigator)) return;
  self.registration.getNotifications().then((list) => {
    try {
      if (list.length === 0) self.navigator.clearAppBadge?.();
      else self.navigator.setAppBadge?.(list.length);
    } catch { /* ignore */ }
  });
});

// Pick the best existing window client to hand a notification action to:
// prefer a focused one, then a visible one, then the most recent.
function pickClient(wins) {
  if (!wins || !wins.length) return null;
  return (
    wins.find((w) => w.focused) ||
    wins.find((w) => w.visibilityState === "visible") ||
    wins[0]
  );
}

// Encode a notification action onto the route URL so a freshly-opened (cold)
// window can replay it on boot. The app's NotificationActionBridge reads these
// `wc*` params, performs the action, then strips them from the URL.
function actionUrl(msg) {
  const base = msg.path || "/inbox";
  const params = new URLSearchParams();
  params.set("wcaction", msg.action);
  if (msg.kind) params.set("wckind", msg.kind);
  if (msg.reply) params.set("wcreply", msg.reply);
  const d = msg.data || {};
  if (d.lead_id != null) params.set("wclead", String(d.lead_id));
  if (d.from_number) params.set("wcto", String(d.from_number));
  if (d.to_email || d.from_email) params.set("wcemail", String(d.to_email || d.from_email));
  if (d.thread_id != null || d.conversation_id != null)
    params.set("wcthread", String(d.thread_id != null ? d.thread_id : d.conversation_id));
  if (d.call_id) params.set("wccall", String(d.call_id));
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${params.toString()}`;
}

/**
 * Hand a notification action to the app. The service worker deliberately does
 * NOT send / answer itself: replies must go through the app (so the inbox
 * updates live and quiet-hours/errors are surfaced) and answering a call needs
 * the in-app WebRTC SDK. If a window is already open we focus it and post the
 * action; otherwise we open a new window with the action encoded in the URL.
 */
async function dispatchActionToApp(msg) {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const client = pickClient(wins);

  if (client) {
    try { await client.focus(); } catch { /* ignore */ }
    try {
      client.postMessage(Object.assign({ type: "wc-notif-action" }, msg));
    } catch { /* ignore */ }
    return;
  }

  // No window open. Declining a call with no app running is a no-op (there is
  // no live WebRTC leg to hang up). Everything else opens the app cold.
  if (msg.action === "decline") return;
  await self.clients.openWindow(actionUrl(msg));
}
