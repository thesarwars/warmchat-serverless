import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchMeBootstrap, type MeBootstrap } from "@/helpers/backend";

/**
 * Surfaces when the agent's `business_address` is empty. Marketing email
 * sends (automations + sequences) refuse to dispatch without it (CAN-SPAM
 * requires a real physical postal address in the footer), so we nudge the
 * agent toward the Settings v2 Workspace tab (#business-address) everywhere
 * they are likely to launch one of those flows: the dashboard overview, the
 * automations screen, etc.
 *
 * Subscribes to the shared `me_bootstrap` query - keeps the address-check
 * piggybacking on the bundled user-scoped reads so the banner doesn't fire
 * its own /profile/me request on the dashboard cold load.
 */
export default function MissingBusinessAddressBanner() {
  const { data } = useQuery<MeBootstrap>({
    queryKey: ["me_bootstrap"],
    queryFn: () => fetchMeBootstrap(),
    enabled: Boolean(localStorage.getItem("token")),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const profileUser = (data?.profile as { user?: { business_address?: string | null } } | undefined)?.user;
  const addr = (profileUser?.business_address || "").trim();
  const missing = data ? !addr : false;

  if (!missing) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">Add your business mailing address</div>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
          Required for email automations and automated email sequences. Once added, you'll be able to send marketing emails through WarmChats.
        </p>
      </div>
      <Link
        to="/admin?tab=org#business-address"
        className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
      >
        Add address
      </Link>
    </div>
  );
}
