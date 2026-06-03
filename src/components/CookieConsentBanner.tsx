import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { setAnalyticsConsent } from "@/lib/mixpanel";

/**
 * Bottom-pinned cookie consent banner. Renders once per device until the
 * visitor accepts or rejects, then never again until they clear localStorage.
 *
 * Why: Mixpanel + Session Replay are non-essential under GDPR/ePrivacy. We
 * defer their init in src/lib/mixpanel.ts until consent is granted. HttpOnly
 * auth cookies are essential (the app cannot work without them) and so are
 * NOT gated - the banner explains the distinction.
 *
 * Accept   -> localStorage["cookie_consent"] = "accepted", mixpanel initializes.
 * Reject   -> localStorage["cookie_consent"] = "rejected", mixpanel skipped forever
 *             (calls to track/identify become no-ops via mixpanel.ts:ready()).
 */

const CONSENT_KEY = "cookie_consent";

export default function CookieConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(CONSENT_KEY);
    if (!stored) setShow(true);
  }, []);

  if (!show) return null;

  const handleAccept = () => {
    setAnalyticsConsent("accepted");
    setShow(false);
  };
  const handleReject = () => {
    setAnalyticsConsent("rejected");
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-200 bg-white p-4 shadow-2xl sm:p-5"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Cookie className="hidden h-6 w-6 shrink-0 text-orange-500 sm:block" />
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-gray-700">
          <p className="font-semibold text-gray-900">
            Cookies and analytics
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            WarmChats uses essential cookies to keep you signed in (these are required and can&apos;t be disabled). We also use non-essential analytics (Mixpanel with session replay, text masked) to improve the product. You can accept or reject the non-essential ones below.{" "}
            <Link to="/privacy" className="font-medium text-orange-600 hover:underline">
              Privacy policy
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleReject}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
