import { useQuery } from "@tanstack/react-query";
import { fetchMeBootstrap, type MeBootstrap } from "./backend";

export type PlanId = "free_channel" | "starter" | "growth" | "custom_brokerage" | string;

/**
 * Fetches the org's current billing plan once per session.
 * Used to gate features like Team management to the Custom Brokerage plan.
 *
 * Subscribes to the shared `me_bootstrap` query - the dashboard's bundled
 * user-scoped reads - so a Sidebar render alongside the dashboard doesn't
 * trigger a second /billing/status round-trip. On non-dashboard pages the
 * bootstrap fetch fires here (lightweight: five small D1 reads in parallel)
 * and is reused if the user then navigates to /dashboard.
 *
 * Falls back to localStorage values written during onboarding so the gate
 * still works before the billing endpoint resolves.
 */
export function usePlan() {
  const fromStorage =
    (localStorage.getItem("selectedPlan") || localStorage.getItem("plan") || "")
      .toLowerCase();

  const { data, isLoading } = useQuery<MeBootstrap>({
    queryKey: ["me_bootstrap"],
    queryFn: () => fetchMeBootstrap(),
    enabled: Boolean(localStorage.getItem("token")),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const billingPlan = (data?.billing as { plan?: string } | null)?.plan;
  const plan: PlanId = (billingPlan || fromStorage || "free_channel") as PlanId;
  const isGrowth = plan === "growth";
  // Team management (Users/Teams/Offices/Lead Routing) is reserved for the
  // Custom Brokerage tier - not Starter or Growth.
  const isBroker = plan === "custom_brokerage";

  return { plan, isGrowth, isBroker, isLoading };
}
