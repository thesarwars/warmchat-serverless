import mixpanel, { type Dict } from "mixpanel-browser";

const TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN as string | undefined;
const DEBUG = import.meta.env.DEV;

let initialized = false;

/**
 * Cookie / consent gate. Mixpanel (and especially Session Replay at 100%) is
 * non-essential under GDPR + ePrivacy. We gate `init()` behind an explicit
 * choice stored in localStorage:
 *
 *   "accepted" -> initMixpanel() runs
 *   "rejected" -> init is skipped; future calls (identify/track) are no-ops
 *   (unset)    -> banner shown, no init yet
 *
 * Once the user picks Accept, this returns true forever (per device). Reject
 * is sticky too - we re-prompt only after they clear localStorage. The banner
 * itself reads/writes this key (see CookieConsentBanner.tsx).
 */
const CONSENT_KEY = "cookie_consent";

function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CONSENT_KEY) === "accepted";
}

export function setAnalyticsConsent(value: "accepted" | "rejected") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_KEY, value);
  if (value === "accepted") initMixpanel();
}

export function initMixpanel() {
  if (initialized) return;
  if (!TOKEN) {
    if (DEBUG) console.warn("[mixpanel] VITE_MIXPANEL_TOKEN missing - analytics disabled");
    return;
  }
  // Bail if the user hasn't accepted yet. This is the cookie-consent gate.
  // The Accept handler in CookieConsentBanner.tsx calls initMixpanel() after
  // it flips the flag, so consent at app boot AND consent post-boot both work.
  if (!hasAnalyticsConsent()) return;
  mixpanel.init(TOKEN, {
    debug: DEBUG,
    track_pageview: true,
    persistence: "localStorage",
    ignore_dnt: false,
    // Session Replay
    // 100% in dev so we can verify; dial down (e.g. 10) for production load/cost.
    record_sessions_percent: DEBUG ? 100 : 100,
    // Mask all text by default. CRM screens contain lead PII, message bodies,
    // emails, and phone numbers - never unmask globally. If you need a specific
    // non-sensitive element visible in replays, add it as a `.mp-include` class
    // or tighten this selector.
    record_mask_text_selector: "*",
    // Block entire elements (inputs, attachments, etc.) by adding class `mp-block`.
    record_block_selector: ".mp-block",
  });
  initialized = true;
}

function ready() {
  return initialized && Boolean(TOKEN);
}

export function mixpanelIdentify(
  userId: string,
  profile?: { email?: string; name?: string; org_id?: string; org_name?: string; role?: string; plan?: string }
) {
  if (!ready() || !userId) return;
  const current = mixpanel.get_distinct_id?.();
  if (current !== userId) {
    mixpanel.identify(userId);
  }
  if (profile) {
    const peopleProps: Dict = {};
    if (profile.email) peopleProps.$email = profile.email;
    if (profile.name) peopleProps.$name = profile.name;
    if (profile.org_id) peopleProps.org_id = profile.org_id;
    if (profile.org_name) peopleProps.org_name = profile.org_name;
    if (profile.role) peopleProps.role = profile.role;
    if (profile.plan) peopleProps.plan = profile.plan;
    if (Object.keys(peopleProps).length) mixpanel.people.set(peopleProps);

    const superProps: Dict = {};
    if (profile.org_id) superProps.org_id = profile.org_id;
    if (profile.plan) superProps.plan = profile.plan;
    if (profile.role) superProps.role = profile.role;
    if (Object.keys(superProps).length) mixpanel.register(superProps);
  }
}

export function mixpanelReset() {
  if (!ready()) return;
  mixpanel.reset();
}

export function track(event: string, props?: Dict) {
  if (!ready()) return;
  mixpanel.track(event, props);
}

const FIRST_MESSAGE_FLAG_PREFIX = "mp_first_message_sent:";

export function trackFirstMessageSent(props: Dict & { channel: "Email" | "SMS" }) {
  if (!ready()) return;
  const userId = mixpanel.get_distinct_id?.();
  if (!userId) return;
  const flagKey = `${FIRST_MESSAGE_FLAG_PREFIX}${userId}`;
  if (localStorage.getItem(flagKey)) return;
  localStorage.setItem(flagKey, "1");
  mixpanel.track("first_message_sent", props);
}
