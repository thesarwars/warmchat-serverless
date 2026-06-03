import { isSessionActive } from "./authSession";

const API_BASE = import.meta.env.VITE_API_BASE;

// Tokens now live in HttpOnly cookies. Pass `credentials: "include"` instead
// of an Authorization header; the older `token` argument is accepted but
// ignored for the actual auth.
const cookieFetch = (input: string, init: RequestInit = {}): Promise<Response> =>
  fetch(input, { credentials: "include", ...init });

const urlB64ToUint8 = (b64: string): Uint8Array => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const isWebPushSupported = (): boolean =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const registerServiceWorker = async (): Promise<
  ServiceWorkerRegistration | null
> => {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.error("Service worker registration failed", err);
    return null;
  }
};

/**
 * Watch for service-worker updates and invoke `onUpdateReady()` when a new
 * worker has finished installing while another one was already controlling
 * the page (i.e. this is a true update, not the first install). Also nudges
 * `registration.update()` on visibility change so installed PWAs (iOS Safari,
 * desktop) actually re-check for new versions when the user reopens them.
 *
 * Returns a teardown function.
 */
export const setupServiceWorkerUpdates = (
  onUpdateReady: () => void,
): (() => void) => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return () => undefined;
  }

  let teardown = (): void => undefined;
  let cancelled = false;

  const fireIfUpdate = (sw: ServiceWorker | null) => {
    if (!sw) return;
    // No prior controller means this is the very first SW install on this
    // device - nothing to "update to" yet.
    if (!navigator.serviceWorker.controller) return;
    if (sw.state === "installed" || sw.state === "activated") {
      onUpdateReady();
    } else {
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed" || sw.state === "activated") {
          onUpdateReady();
        }
      });
    }
  };

  const watch = (reg: ServiceWorkerRegistration) => {
    // A worker may already be waiting from a previous tab/session.
    fireIfUpdate(reg.waiting);
    fireIfUpdate(reg.installing);

    const onUpdateFound = () => fireIfUpdate(reg.installing);
    reg.addEventListener("updatefound", onUpdateFound);

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      reg.update().catch((): void => undefined);
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Background poll every 30 minutes for tabs left open all day.
    const pollId = window.setInterval(() => {
      reg.update().catch((): void => undefined);
    }, 30 * 60 * 1000);

    teardown = () => {
      reg.removeEventListener("updatefound", onUpdateFound);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(pollId);
    };
  };

  navigator.serviceWorker.ready
    .then((reg) => {
      if (cancelled) return;
      watch(reg);
    })
    .catch((): void => undefined);

  return () => {
    cancelled = true;
    teardown();
  };
};

export const getCurrentSubscription =
  async (): Promise<PushSubscription | null> => {
    if (!isWebPushSupported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  };

export const enableWebPush = async (_token?: string): Promise<boolean> => {
  if (!isWebPushSupported()) {
    throw new Error("Web push is not supported in this browser");
  }
  const reg = await registerServiceWorker();
  if (!reg) throw new Error("Could not register the service worker");

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    throw new Error("Notification permission was not granted");
  }

  const keyRes = await cookieFetch(`${API_BASE}/notifications/vapid-public-key`);
  if (!keyRes.ok) {
    throw new Error("VAPID public key is not configured on the server");
  }
  const { public_key } = await keyRes.json();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(public_key) as unknown as ArrayBuffer,
    });
  }

  const subRes = await cookieFetch(`${API_BASE}/notifications/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });

  if (!subRes.ok) {
    throw new Error("Failed to register subscription with the server");
  }
  return true;
};

export const disableWebPush = async (_token?: string): Promise<void> => {
  if (!isWebPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await cookieFetch(`${API_BASE}/notifications/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } finally {
    await sub.unsubscribe();
  }
};

// App.tsx invokes syncSubscriptionOnBoot from three triggers (mount,
// auth-session-changed, visibilitychange) and on cold load the first two fire
// back-to-back, double-POSTing the same subscription. The window guards the
// network call without changing the cadence the callers depend on.
const SUBSCRIBE_DEDUPE_WINDOW_MS = 60_000;
let lastSubscribedEndpoint: string | null = null;
let lastSubscribedAt = 0;

export const syncSubscriptionOnBoot = async (
  _token?: string | null,
): Promise<void> => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  // ALWAYS register the SW on boot - independent of notification permission.
  // Chrome only fires `beforeinstallprompt` when an active SW controls the
  // start_url, so gating registration on permission was making the PWA
  // install dialog impossible to trigger for users who hadn't enabled push.
  const reg = await registerServiceWorker();
  if (!reg) return;
  // The remaining work - syncing an existing push subscription with the
  // server - only matters once the user has granted notification permission.
  if (!isWebPushSupported()) return;
  if (Notification.permission !== "granted") return;
  // The /notifications/subscribe endpoint requires auth. Skip the POST when
  // there's no active session (e.g. logged-out visitor on the marketing
  // homepage whose browser still remembers a prior granted permission) -
  // otherwise it 401s on every page load.
  if (!isSessionActive()) return;
  try {
    let sub = await reg.pushManager.getSubscription();
    // Permission granted but no live subscription on this device. This can
    // happen after the browser garbage-collects an unused subscription, after
    // a push-service-side expiry, or right after a server DB reset where the
    // browser's local sub was also torn down. Try to mint a fresh one so the
    // user keeps receiving notifications without having to re-grant.
    if (!sub) {
      try {
        const keyRes = await cookieFetch(
          `${API_BASE}/notifications/vapid-public-key`,
        );
        if (!keyRes.ok) return;
        const { public_key } = await keyRes.json();
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8(public_key) as unknown as ArrayBuffer,
        });
      } catch (err) {
        console.warn("Auto-resubscribe failed", err);
        return;
      }
    }
    if (
      lastSubscribedEndpoint === sub.endpoint &&
      Date.now() - lastSubscribedAt < SUBSCRIBE_DEDUPE_WINDOW_MS
    ) {
      return;
    }
    // POST back to the server. After a DB reset the server forgot us, so this
    // upsert is what restores delivery for devices that already opted in.
    const res = await cookieFetch(`${API_BASE}/notifications/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (res.ok) {
      lastSubscribedEndpoint = sub.endpoint;
      lastSubscribedAt = Date.now();
    }
  } catch (err) {
    console.warn("Web push subscription sync failed", err);
  }
};
