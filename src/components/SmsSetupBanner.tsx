import { useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchMeBootstrap, type MeBootstrap } from "@/helpers/backend";

/**
 * Post-upgrade nudge: a Free user finishes onboarding with email connected but
 * SMS locked. When they later upgrade to a paid plan, email is already wired up
 * - the one thing left is an SMS number. This dashboard banner prompts exactly
 * that, and only that.
 *
 * Shows ONLY when: plan is paid (org.plan !== 'free_channel') AND no phone
 * number is connected yet. Free users (SMS not available to them) and users who
 * already have a number never see it. Dismissible - persisted in localStorage so
 * it doesn't nag (the sidebar "Getting started" checklist keeps the SMS step as
 * a permanent backup).
 *
 * Subscribes to the shared `me_bootstrap` query so it piggybacks on the
 * dashboard's bundled user-scoped reads instead of firing its own request.
 */
const DISMISS_KEY = "wc_sms_setup_banner_dismissed";

export default function SmsSetupBanner() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1",
  );

  const { data } = useQuery<MeBootstrap>({
    queryKey: ["me_bootstrap"],
    queryFn: () => fetchMeBootstrap(),
    enabled: Boolean(localStorage.getItem("token")),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const plan = (data?.billing as { plan?: string } | null)?.plan ?? null;
  const connectedNumber = data?.phone_number?.phone_number ?? null;
  const hasSmsAccess = Boolean(plan) && plan !== "free_channel";

  // Only the post-upgrade window: paid plan, email already done in onboarding,
  // no SMS number yet.
  if (!data || dismissed || !hasSmsAccess || connectedNumber) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#FFE0D2] bg-[#FFF3EC] p-4 text-[#7c3a16]">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#FF6B35]">
        <MessageSquare className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[#101828]">
          You're on a paid plan - connect your SMS number
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-[#8a5a3a]">
          Your email is already set up. Add a business number to start texting and
          calling your leads from WarmChats.
        </p>
      </div>
      <Link
        to="/connect-phone"
        className="shrink-0 rounded-md bg-[#FF6B35] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#e25a09]"
      >
        Connect number
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1 text-[#b88a6a] transition hover:bg-white/60 hover:text-[#7c3a16]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
