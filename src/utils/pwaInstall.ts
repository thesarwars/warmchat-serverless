/**
 * The `beforeinstallprompt` event fires very early - typically before this
 * module has even been parsed. To avoid losing it to a script-loading race,
 * an inline `<script>` in index.html stashes the deferred event on
 * `window.__wcPwa` synchronously. This module bridges that stash into a
 * subscribable store any UI surface (banner, Settings button) can use.
 *
 * Chrome only re-fires the event in narrow conditions, so once we've handed
 * it off via `prompt()` we drop it and surface "unavailable" to callers
 * until the browser decides to re-arm it.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface WindowPwaStash {
  event: BeforeInstallPromptEvent | null;
  installed: boolean;
}

type Listener = () => void;

declare global {
  interface Window {
    __wcPwa?: WindowPwaStash;
  }
}

const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) {
    try { l(); } catch { /* ignore listener errors */ }
  }
}

function getStash(): WindowPwaStash | null {
  if (typeof window === "undefined") return null;
  if (!window.__wcPwa) window.__wcPwa = { event: null, installed: false };
  return window.__wcPwa;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ios = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    !!ios
  );
}

if (typeof window !== "undefined") {
  const stash = getStash();
  if (stash && !stash.installed && isStandalone()) {
    stash.installed = true;
  }
  // The inline script in index.html captures the original browser events
  // directly so we don't need duplicate listeners here. We just listen for
  // the synthesized custom events to know when to notify subscribers.
  window.addEventListener("wc:pwa-prompt-ready", () => notify());
  window.addEventListener("wc:pwa-installed", () => notify());
}

export function subscribePwaInstall(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when a deferred prompt is available right now (Chromium / Android). */
export function canPromptPwaInstall(): boolean {
  const stash = getStash();
  return !!stash && !stash.installed && stash.event !== null;
}

/** True after `appinstalled` fires (or the page already opened as standalone). */
export function isPwaInstalled(): boolean {
  const stash = getStash();
  return !!stash?.installed;
}

/**
 * Fire Chrome's install dialog. Returns the user's choice. Safe to call when
 * no deferred prompt is available - it just resolves to "unavailable".
 */
/**
 * Open the full-screen install-guide modal. Any UI surface (small banner,
 * Settings row, etc.) can call this. The modal itself listens for the
 * `wc:pwa-show-install-guide` event raised here.
 */
export function openInstallGuide(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("wc:pwa-show-install-guide"));
}

export async function triggerPwaInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const stash = getStash();
  const evt = stash?.event ?? null;
  if (!stash || !evt) return "unavailable";
  try {
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === "accepted") {
      stash.installed = true;
      stash.event = null;
      notify();
    } else {
      // Chrome only allows the deferred event to be prompted once. Clear it
      // so subsequent calls correctly return "unavailable" until the browser
      // re-arms `beforeinstallprompt`.
      stash.event = null;
      notify();
    }
    return choice.outcome;
  } catch {
    stash.event = null;
    notify();
    return "unavailable";
  }
}
