/**
 * Public / marketing + auth routes that should NEVER surface the in-app
 * notification or install prompts - we don't want to wall off a visitor who's
 * still reading about WarmChats or sitting on the login screen. Anything not
 * matched here is treated as a dashboard route and is allowed to show those
 * prompts.
 *
 * We match on pathname (not auth state) so a signed-in user who navigates
 * back to "/" still gets the marketing UX rather than an app nudge.
 *
 * A prefix ending in "/" matches that subtree (e.g. "/agents/" matches
 * "/agents/acme"); a prefix without one matches the path exactly or as a
 * segment parent (e.g. "/pricing" matches "/pricing" and "/pricing/x").
 */
const PUBLIC_ROUTE_PREFIXES = [
  "/login",
  "/signup",
  "/pricing",
  "/waitlist",
  "/features",
  "/privacy",
  "/terms",
  "/support",
  "/opt-in",
  "/forgot-password",
  "/reset-password",
  "/confirm-email",
  "/verify-email",
  "/accept-invite",
  "/agents/",
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_ROUTE_PREFIXES.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/"),
  );
}
