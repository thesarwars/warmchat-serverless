import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { enableWebPush, isWebPushSupported } from "@/utils/webPush";
import { notificationUnblockSteps } from "@/utils/browserDetect";
import { isPublicPath } from "@/utils/publicRoutes";

/**
 * Top-right banner shown on desktop browsers while the user's browser
 * notification permission is still "default" or "denied". Scoped to the
 * dashboard - it never appears on the home page or other public / marketing
 * routes (see isPublicPath), so a visitor still reading about WarmChats isn't
 * nudged to enable app notifications. Mobile devices
 * get the full-screen install/notification modal instead - this banner is
 * intentionally narrow scope so a workstation user isn't blocked by a
 * modal but still gets nudged to set notifications up.
 *
 * Auto-clears on grant. Closes hide it only for this page load - a refresh
 * brings it back so the user can't easily forget to enable it.
 *
 * Chrome's permission-abuse heuristic silently flips "default" to "denied"
 * after the user closes the OS prompt a few times in a row, so on a
 * "default" outcome we don't toast an error and we briefly disable the
 * Enable button to give the user time to come back to it.
 */

const RETRY_COOLDOWN_MS = 30_000;

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ios = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || !!ios;
}

export function DesktopNotifPrompt() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  // Dismissing hides the banner for the rest of this page load. The component
  // stays mounted across route changes, so this flag survives navigation and
  // only resets on a real refresh - that's what brings the banner back.
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );

  // Keep the live permission in state - if the user changes it through OS /
  // browser settings the banner needs to mirror that immediately.
  useEffect(() => {
    const sync = () => {
      if (typeof Notification === "undefined") return;
      setPermission(Notification.permission);
    };
    sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Dashboard-only: hide on home / marketing / auth pages. Also covers the
    // case where the banner is already up and the user navigates back out.
    if (isPublicPath(location.pathname)) {
      setVisible(false);
      return;
    }
    if (dismissed) return; // closed for this page load - wait for a refresh
    if (isMobileDevice()) return; // mobile uses the full-screen modal
    if (isStandalone()) return; // standalone uses the modal too
    if (!isWebPushSupported()) return;
    if (permission === "granted" || permission === "unsupported") return;
    const t = window.setTimeout(() => setVisible(true), 1200);
    return () => window.clearTimeout(t);
  }, [permission, location.pathname, dismissed]);

  useEffect(() => {
    if (!cooldown) return;
    const t = window.setTimeout(() => setCooldown(false), RETRY_COOLDOWN_MS);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const dismiss = () => {
    setVisible(false);
    setDismissed(true);
  };

  const onEnable = async () => {
    setBusy(true);
    try {
      await enableWebPush();
      toast.success("Notifications enabled");
      setPermission("granted");
      setVisible(false);
    } catch (err) {
      const perm =
        typeof Notification !== "undefined" ? Notification.permission : "unsupported";
      setPermission(perm);
      if (perm === "denied") {
        toast.error("Browser notifications are blocked.");
      } else if (perm === "default") {
        setCooldown(true);
      } else if (err instanceof Error && err.message) {
        toast.error(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  const blocked = permission === "denied";
  const enableDisabled = busy || cooldown;
  const enableLabel = busy
    ? "Enabling..."
    : cooldown
      ? "Try again shortly"
      : "Enable";

  return (
    <div className="fixed right-4 top-20 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-orange-200 bg-orange-50 p-3 shadow-md ring-1 ring-orange-200/60">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white">
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-orange-950">
            {blocked ? "Notifications are blocked" : "Turn on notifications"}
          </p>
          <p className="mt-0.5 text-xs text-orange-900/80">
            {blocked
              ? "Re-enable them to keep hearing about lead replies, calls, and appointments while the tab isn't focused."
              : "Hear about lead replies, calls, and appointments while WarmChats isn't focused."}
          </p>
          {blocked && (
            <p className="mt-1 text-[11px] leading-snug text-orange-900/80">
              {notificationUnblockSteps()}
            </p>
          )}
          {cooldown && !blocked && (
            <p className="mt-1 text-[11px] text-orange-900/70">
              You closed the browser prompt. Click again when you're ready to
              choose.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            {!blocked && (
              <button
                type="button"
                onClick={onEnable}
                disabled={enableDisabled}
                className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {enableLabel}
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-orange-900/80 hover:bg-orange-100"
            >
              {blocked ? "Got it" : "Not now"}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-orange-700 hover:bg-orange-100"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
