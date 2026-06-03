/**
 * Decides where a freshly-authenticated (or already-logged-in) user should
 * land. Shared by Login.tsx, SignUp.tsx and the route guard so visiting any
 * authenticated surface honors onboarding state instead of bypassing the
 * funnel.
 */
export async function resolvePostAuthDestination(
  apiBase: string,
  userId: string | number,
): Promise<string> {
  const res = await fetch(`${apiBase}/onboarding/${userId}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Onboarding lookup failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    step?: number | null;
    is_invited?: boolean;
  };
  const step = Number(data?.step || 0);
  localStorage.setItem("onboardingStep", step.toString());
  localStorage.setItem("isInvited", data?.is_invited ? "1" : "0");

  return onboardingDestinationFor(step, Boolean(data?.is_invited));
}

function onboardingDestinationFor(step: number, isInvited: boolean): string {
  if (step > 0 && step < 5) {
    return isInvited ? "/onboarding-agents-managers" : "/onboarding";
  }
  return "/dashboard";
}

/**
 * Synchronous read of cached onboarding state. Returns null when we haven't
 * fetched it yet for this session - callers should fall back to
 * resolvePostAuthDestination in that case.
 */
export function readCachedOnboardingDestination(): string | null {
  const rawStep = localStorage.getItem("onboardingStep");
  if (rawStep === null || rawStep === "") return null;
  const step = Number(rawStep);
  if (!Number.isFinite(step)) return null;
  const isInvited = localStorage.getItem("isInvited") === "1";
  return onboardingDestinationFor(step, isInvited);
}

/**
 * Routes that are part of (or downstream of) the onboarding / payment funnel
 * itself - the guard must not redirect away from these or the user gets stuck
 * in a loop. Pricing/upgrade/billing pages are included so a half-onboarded
 * user can still finish payment.
 */
const ONBOARDING_EXEMPT_PREFIXES = [
  "/onboarding",
  "/onboarding-agents-managers",
  "/connect-domain",
  "/connect-email",
  "/connect-phone",
  "/billing",
  "/upgrade",
  "/pricing",
  "/accept-invite",
  "/verify-email",
  "/confirm-email",
];

export function isOnboardingExemptPath(pathname: string): boolean {
  return ONBOARDING_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
