import { useEffect, useRef, useState } from "react";
import { Apple, Smartphone, X, Download, Loader2, Bell, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  canPromptPwaInstall,
  isPwaInstalled,
  subscribePwaInstall,
  triggerPwaInstall,
} from "@/utils/pwaInstall";
import { enableWebPush, isWebPushSupported } from "@/utils/webPush";
import { isPublicPath } from "@/utils/publicRoutes";
import { IosInstallGuide } from "./IosInstallGuide";

/**
 * Full-screen install guide. Mounted globally; opens whenever any UI calls
 * `openInstallGuide()` (which dispatches the `wc:pwa-show-install-guide`
 * event). On iOS Safari we also auto-open the first time the user visits
 * (session-scoped) because Apple doesn't expose a programmatic install path
 * and a small banner doesn't convey the multi-step home-screen flow.
 *
 * The iOS guide is the <IosInstallGuide> walkthrough - four phone mockups
 * with red call-out boxes on each tap target - since Apple exposes no
 * programmatic install path.
 *
 * Android (Chromium) is handled programmatically via the cached
 * `beforeinstallprompt` event - the Install button calls `triggerPwaInstall()`
 * to surface Chrome's own install dialog.
 */

type Platform = "ios" | "android";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "android";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  // Desktop visitors fall through to the Android tab - the modal only covers
  // mobile install flows now, and Chrome/Edge/Brave on desktop expose their
  // own address-bar install icon for users who want the desktop PWA path.
  return "android";
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua);
  const webkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && webkit;
}

function isPublicRoute(): boolean {
  if (typeof window === "undefined") return true;
  return isPublicPath(window.location.pathname);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ios = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || !!ios;
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
}

export function PwaInstallModal() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Platform>(detectPlatform());
  const [hasPrompt, setHasPrompt] = useState(canPromptPwaInstall());
  const [installed, setInstalled] = useState(isPwaInstalled());
  const [busy, setBusy] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Subscribe to the global deferred-prompt store so the Install button
  // light up the moment Chrome arms beforeinstallprompt.
  useEffect(() => {
    return subscribePwaInstall(() => {
      setHasPrompt(canPromptPwaInstall());
      setInstalled(isPwaInstalled());
    });
  }, []);

  // Open when any surface dispatches `wc:pwa-show-install-guide`.
  useEffect(() => {
    const onShow = () => setOpen(true);
    window.addEventListener("wc:pwa-show-install-guide", onShow);
    return () => window.removeEventListener("wc:pwa-show-install-guide", onShow);
  }, []);

  // Always re-read Notification.permission whenever this module gets a fresh
  // chance: on first mount, when the page regains focus, when the document
  // becomes visible, and right before the modal opens. The browser's
  // permission can flip out from under us (OS settings, browser site
  // settings, abuse heuristics, "Clear site data") and our React state needs
  // to mirror reality - otherwise the "Notifications are on" stripe lies.
  useEffect(() => {
    const sync = () => {
      if (typeof Notification === "undefined") return;
      setNotifPermission(Notification.permission);
    };
    sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  // Auto-open logic:
  //   - In standalone (PWA): only open if notifications need attention.
  //   - On a desktop browser: never auto-open. Install on desktop is a
  //     "click the address-bar icon" flow that doesn't need a modal, and
  //     blocking an active workflow on a workstation is hostile UX.
  //   - On mobile + already installed: always open so the "Open the
  //     WarmChats app" CTA is reachable from any route.
  //   - On mobile + not installed: open inside the dashboard. Marketing
  //     routes (/, /login, /pricing, ...) don't get an install ask.
  // No session snooze - a refresh brings the modal back until the user
  // actually resolves their decisions. Closing only hides for this page load.
  useEffect(() => {
    const needsPermission =
      typeof Notification !== "undefined" && Notification.permission !== "granted";

    if (isStandalone()) {
      // Inside the installed PWA: only worth opening for the notification ask.
      if (!needsPermission) return;
      const t = window.setTimeout(() => setOpen(true), 1500);
      return () => window.clearTimeout(t);
    }
    // Browser tab path: only mobile devices see the install / open-app modal.
    if (!isMobileDevice()) return;
    if (installed) {
      const t = window.setTimeout(() => setOpen(true), 1500);
      return () => window.clearTimeout(t);
    }
    if (isPublicRoute()) return;
    const canInstall = canPromptPwaInstall();
    const iosNeedsHelp = isIosSafari();
    if (!needsPermission && !canInstall && !iosNeedsHelp) return;
    const t = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(t);
  }, [hasPrompt, installed, notifPermission]);

  // Auto-close 5s after the user grants notification permission inside the
  // PWA (or anywhere there's nothing else to act on) so the modal doesn't
  // strand them on the "Notifications are on" stripe with no obvious exit.
  useEffect(() => {
    if (!open) return;
    if (notifPermission !== "granted") return;
    const nothingLeftToDo = isStandalone() || (installed && !canPromptPwaInstall());
    if (!nothingLeftToDo) return;
    const t = window.setTimeout(() => setOpen(false), 5000);
    return () => window.clearTimeout(t);
  }, [open, notifPermission, installed]);

  // Esc to close + lock body scroll + autofocus the close button so screen
  // readers announce the dialog.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onInstall = async () => {
    setBusy(true);
    try {
      const outcome = await triggerPwaInstall();
      if (outcome === "accepted") {
        toast.success("Installing WarmChats...");
        setOpen(false);
      } else if (outcome === "dismissed") {
        toast("Install cancelled");
      } else {
        toast.error(
          "Your browser didn't expose an install option. Try Chrome, Edge, or Brave.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const onEnableNotifications = async () => {
    setNotifBusy(true);
    try {
      await enableWebPush();
      toast.success("Notifications enabled");
      setNotifPermission("granted");
    } catch (err) {
      const perm =
        typeof Notification !== "undefined" ? Notification.permission : "unsupported";
      setNotifPermission(perm);
      if (perm === "denied") {
        toast.error(
          "Browser notifications are blocked. Open the site settings to allow them.",
        );
      } else if (perm === "default") {
        // User closed Chrome's prompt - no toast, they can try again.
      } else {
        toast.error(
          err instanceof Error ? err.message : "Could not enable notifications",
        );
      }
    } finally {
      setNotifBusy(false);
    }
  };

  /**
   * "Open the WarmChats app" handler. There is NO portable JavaScript API
   * that launches an installed PWA from a regular browser tab - this is a
   * platform restriction, not a bug we can fix. Best we can do:
   *   - Chromium: with `launch_handler: { client_mode: "navigate-existing" }`
   *     set in the manifest, navigating to the manifest's scope from a
   *     regular tab will focus an already-open PWA window if one exists.
   *     If the PWA isn't running, the browser does nothing - the user has
   *     to launch it from the home screen / dock manually.
   *   - iOS Safari, Firefox, other browsers: no launch API at all; the same
   *     navigation just reloads the current tab.
   * The companion UI below the button always shows manual fallback steps so
   * users on unsupported browsers know to look for the app icon themselves.
   */
  const onOpenInstalledApp = () => {
    try {
      // Use start_url verbatim so launch_handler matches; some Chromium
      // versions are picky about scope.
      window.location.assign("/inbox");
    } catch {
      /* ignore */
    }
  };

  // Closing logic:
  //   - Not open: don't render.
  // Standalone (running inside the PWA) still renders - we keep the modal
  // available there so notifications can be enabled / unblocked. Install
  // steps and the "Open the app" CTA hide themselves in standalone via
  // showInstallSteps and showOpenAppHint below.
  if (!open) return null;

  const inStandalone = isStandalone();
  const showOpenAppHint = installed && !inStandalone;
  const showInstallSteps = !installed && !inStandalone;
  const showNotifCta =
    (notifPermission === "default" || notifPermission === "denied") &&
    typeof Notification !== "undefined" &&
    isWebPushSupported();
  const notifGranted = notifPermission === "granted";
  const notifBlocked = notifPermission === "denied";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-modal-title"
      className="fixed inset-0 z-100 flex items-stretch justify-stretch bg-black/60 backdrop-blur-sm"
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h2
              id="pwa-install-modal-title"
              className="text-lg font-semibold text-gray-900"
            >
              {showOpenAppHint ? "WarmChats is already installed" : "Install WarmChats as an app"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-600">
              {showOpenAppHint
                ? "Open WarmChats from your home screen or desktop shortcut for full browser-notification support."
                : "Pin WarmChats to your home screen or desktop and unlock full browser-notification support, including on iPhone and iPad."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-300"
              aria-label="Refresh page"
              title="Refresh - re-check install + notification state"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-1 rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-300"
              aria-label="Close install guide"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Platform tabs only matter for users who haven't installed yet AND
            aren't already running inside the PWA. In standalone there's
            nothing to install; in the open-app state the user is past the
            install step. */}
        {showInstallSteps && (
          <div className="flex border-b border-gray-200 px-5">
            {(
              [
                { key: "ios", label: "iPhone / iPad", icon: Apple },
                { key: "android", label: "Android", icon: Smartphone },
              ] as const
            ).map((t) => {
              const active = tab === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "border-orange-500 text-orange-600"
                      : "border-transparent text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Body. Notification status comes first so the most actionable thing
            is at the top, regardless of whether install / open-app steps are
            also showing below. */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {showNotifCta && (
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-orange-950">
                    Turn on browser notifications
                  </p>
                  <p className="mt-0.5 text-xs text-orange-900/80">
                    {showOpenAppHint
                      ? "Enable them here too so this browser tab also stays in sync with new messages and calls."
                      : "Hear about lead replies, calls, and appointments while this tab is in the background. You can change this anytime in Account & Usage."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onEnableNotifications}
                disabled={notifBusy}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {notifBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                Enable notifications
              </button>
            </div>
          )}

          {notifGranted && (() => {
            // When the only outstanding action was enabling notifications and
            // the user just granted, give them a clear, full-width "you're
            // done" view with a prominent Close button instead of leaving
            // them stranded on a tiny status stripe. Covers the in-PWA case
            // (no install, no open-app to do) and the
            // installed-with-no-pending-install case.
            const nothingLeftToDo = inStandalone || (installed && !canPromptPwaInstall());
            if (nothingLeftToDo) {
              return (
                <div className="mb-2 flex flex-col items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-emerald-950">
                      You're all set
                    </p>
                    <p className="mt-1 text-sm text-emerald-900/80">
                      Browser notifications are on. You'll hear about lead
                      replies, calls, and appointments even when WarmChats
                      isn't focused.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="w-full max-w-xs rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 sm:w-auto"
                    autoFocus
                  >
                    Close
                  </button>
                  <p className="text-[11px] text-emerald-900/60">
                    Closes automatically in a few seconds.
                  </p>
                </div>
              );
            }
            return (
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
                <Check className="h-4 w-4 text-emerald-600" />
                Notifications are on for this browser.
              </div>
            );
          })()}

          {notifBlocked && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-snug text-amber-900">
              Browser notifications are blocked. Open your browser site settings
              for this page and set Notifications to <em>Allow</em>, then refresh.
            </div>
          )}

          {showOpenAppHint && (
            <div className="flex flex-col items-center gap-5 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  WarmChats is installed on this device
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
                  Browser notifications and the WarmChats icon live in the
                  installed app version, not this tab. Open it to keep things in
                  sync.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenInstalledApp}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Try to open the WarmChats app
              </button>
              {/* Honest fallback. There's no portable JS API to launch an
                  installed PWA from a regular browser tab - on Chromium the
                  `launch_handler` we set in the manifest helps when the app
                  is already running, but otherwise the user has to find the
                  icon themselves. */}
              <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-gray-50 p-3 text-left text-xs text-gray-600">
                <p className="font-semibold text-gray-800">
                  If that button just reloads this page:
                </p>
                <ul className="mt-1.5 space-y-1 leading-snug">
                  <li>
                    <strong>iPhone / iPad:</strong> tap your Home Screen, then
                    tap the <em>WarmChats</em> icon (or swipe down and search
                    "WarmChats").
                  </li>
                  <li>
                    <strong>Android:</strong> press Home, find the WarmChats
                    icon on a home screen, or open the App Drawer and search
                    for "WarmChats".
                  </li>
                  <li>
                    <strong>Windows / macOS:</strong> use the Start menu /
                    Spotlight to launch WarmChats - it lives alongside your
                    other apps.
                  </li>
                </ul>
                <p className="mt-2 text-[11px] text-gray-500">
                  Browsers don't let websites launch installed apps directly,
                  so this is a one-time round trip.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  try { localStorage.removeItem("wc_pwa_installed"); } catch { /* ignore */ }
                  setInstalled(false);
                }}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline"
              >
                I uninstalled it - show install steps instead
              </button>
            </div>
          )}

          {showInstallSteps && tab === "ios" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Web push on iPhone and iPad only works once WarmChats is installed
                to your Home Screen. Open this page in <strong>Safari</strong> (not
                an in-app browser), then follow these four taps:
              </p>
              <IosInstallGuide />
              <p className="text-[11px] text-gray-500">
                Once it's on your Home Screen, open WarmChats from the new icon and
                grant notification permission when asked.
              </p>
            </div>
          )}

          {showInstallSteps && tab === "android" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                On Android you can install WarmChats directly from the browser.
                Most users will be able to use the one-tap button below; if your
                browser doesn't show it, follow the manual steps.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onInstall}
                  disabled={busy || !hasPrompt}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Install WarmChats
                </button>
                {!hasPrompt && (
                  <button
                    type="button"
                    onClick={() => {
                      try { localStorage.setItem("wc_pwa_installed", "1"); } catch { /* ignore */ }
                      setInstalled(true);
                    }}
                    className="text-xs font-medium text-orange-600 hover:text-orange-700 hover:underline"
                  >
                    I already installed it
                  </button>
                )}
              </div>
              {!hasPrompt && (
                <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-snug text-gray-700">
                  If WarmChats is already on this device, find its icon on the
                  Home Screen or open the App Drawer and search "WarmChats" -
                  Chrome doesn't show an install button for apps you already
                  have. Otherwise, follow the manual steps below.
                </p>
              )}
              <ol className="space-y-2 text-sm text-gray-800">
                <li className="flex gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] font-semibold text-orange-700">
                    1
                  </span>
                  <span>
                    Open WarmChats in <strong>Chrome</strong>, <strong>Edge</strong>,
                    or <strong>Brave</strong>.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] font-semibold text-orange-700">
                    2
                  </span>
                  <span>
                    Open the browser menu (three dots, top right).
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] font-semibold text-orange-700">
                    3
                  </span>
                  <span>
                    Tap <strong>Add to Home screen</strong> (or
                    <strong> Install app</strong> on newer versions).
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] font-semibold text-orange-700">
                    4
                  </span>
                  <span>
                    Confirm <strong>Add</strong>. Open WarmChats from the new
                    home-screen icon and grant notification permission when asked.
                  </span>
                </li>
              </ol>
              <p className="text-[11px] text-gray-500">
                Samsung Internet usually shows an install icon directly in the URL
                bar - tap it and confirm.
              </p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          <p className="text-[11px] text-gray-500">
            Already installed? Open WarmChats from your home screen / desktop and
            this dialog won't appear again.
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
