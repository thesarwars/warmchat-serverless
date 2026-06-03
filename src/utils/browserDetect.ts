/**
 * Tiny user-agent sniffer used only for picking the right "how to unblock
 * notifications" copy. Don't reach for this for feature detection - prefer
 * `if ('foo' in window)` for that.
 */

export type Browser =
  | "safari-macos"
  | "safari-ios"
  | "chrome"
  | "edge"
  | "firefox"
  | "opera"
  | "unknown";

function detectBrowser(): Browser {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  // Order matters: Edge / Opera / Chromium-on-iOS UAs all contain "Safari".
  if (/Edg\//.test(ua)) return "edge";
  if (/OPR\//.test(ua) || /Opera/.test(ua)) return "opera";
  if (/Firefox/.test(ua) || /FxiOS/.test(ua)) return "firefox";
  if (/Chrome|CriOS/.test(ua)) return "chrome";
  if (/Safari/.test(ua)) return /iPhone|iPad|iPod/.test(ua) ? "safari-ios" : "safari-macos";
  return "unknown";
}

/**
 * Steps to unblock browser notifications for this origin, in the user's
 * current browser. Returns plain text suitable for a short hint paragraph.
 */
export function notificationUnblockSteps(browser: Browser = detectBrowser()): string {
  switch (browser) {
    case "chrome":
      return "Click the lock or tune icon in the address bar -> Site settings -> Notifications -> Allow, then refresh.";
    case "edge":
      return "Click the lock icon in the address bar -> Permissions for this site -> Notifications -> Allow, then refresh.";
    case "firefox":
      return "Click the lock icon in the address bar -> Connection secure -> More information -> Permissions, set Receive Notifications to Allow, then refresh.";
    case "opera":
      return "Click the lock icon in the address bar -> Site settings -> Notifications -> Allow, then refresh.";
    case "safari-macos":
      return "Open Safari -> Settings -> Websites -> Notifications, set this site to Allow, then refresh.";
    case "safari-ios":
      return "Open the Settings app -> Safari -> Advanced -> Website Data, search for this site and reset its permission. (iOS Safari only delivers browser push to installed home-screen apps.)";
    default:
      return "Open your browser's site settings for this page and set Notifications to Allow, then refresh.";
  }
}
