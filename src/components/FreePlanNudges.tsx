import { useQuery } from "@tanstack/react-query";
import { Zap, Flame, AlertTriangle } from "lucide-react";
import { fetchMeBootstrap, type MeBootstrap } from "@/helpers/backend";
import UpgradeNudge from "./UpgradeNudge";

/**
 * Contextual Free-plan upgrade nudges for the dashboard. Shows AT MOST ONE at a
 * time (not annoying), picked by priority:
 *   1. Usage limit reached/approaching (#2)  - most urgent
 *   2. Hot leads ready for follow-up (#4)     - high-intent moment
 *   3. Generic "you're on Free" banner (#5)   - always-on fallback
 * Each is individually dismissible (UpgradeNudge remembers per-id). Only renders
 * for the Free plan; paid users see nothing here. Reuses the shared me_bootstrap
 * query (no extra network round-trip).
 */
const FREE_EMAIL_CAP = 500; // free_channel monthly email allowance

export default function FreePlanNudges({ hotLeadsCount = 0 }: { hotLeadsCount?: number }) {
  const { data } = useQuery<MeBootstrap>({
    queryKey: ["me_bootstrap"],
    queryFn: () => fetchMeBootstrap(),
    enabled: Boolean(localStorage.getItem("token")),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });
  if (!data) return null;

  const plan = (data.billing as { plan?: string } | null)?.plan ?? null;
  const isFree = !plan || plan === "free_channel";
  if (!isFree) return null;

  // Email usage this cycle (from the bundled profile usage summary).
  const profile = data.profile as { usage_summary?: { email?: { used?: number; limit?: number } }; usage?: { email?: { used?: number; limit?: number } } } | undefined;
  const emailUse = profile?.usage_summary?.email ?? profile?.usage?.email;
  const used = Number(emailUse?.used ?? 0);
  const cap = Number(emailUse?.limit ?? FREE_EMAIL_CAP) || FREE_EMAIL_CAP;

  // 1) Usage limit - nudge once they've used 80%+ of the monthly email cap.
  if (cap > 0 && used >= cap * 0.8) {
    const atCap = used >= cap;
    return (
      <UpgradeNudge
        id="usage-limit"
        tone="amber"
        icon={<AlertTriangle className="h-4 w-4" />}
        title={atCap ? `You've sent ${used.toLocaleString()} of ${cap.toLocaleString()} emails this month` : `You're nearing your monthly email limit (${used.toLocaleString()}/${cap.toLocaleString()})`}
        message="Upgrade to keep sending with SMS automation and much higher limits."
      />
    );
  }

  // 2) Hot leads ready - high-intent moment to pitch SMS.
  if (hotLeadsCount > 0) {
    return (
      <UpgradeNudge
        id="hot-leads"
        icon={<Flame className="h-4 w-4" />}
        title={`${hotLeadsCount} hot lead${hotLeadsCount === 1 ? "" : "s"} ready for follow-up`}
        message="SMS follow-up gets 3-5x higher response rates. Upgrade to Growth to reach them by text."
        cta="Upgrade to Growth"
      />
    );
  }

  // 3) Always-on free-plan banner.
  return (
    <UpgradeNudge
      id="free-plan"
      icon={<Zap className="h-4 w-4" />}
      title="You're on the Free plan"
      message="Unlock SMS automation, AI follow-ups, and appointment booking."
      cta="Upgrade"
    />
  );
}
