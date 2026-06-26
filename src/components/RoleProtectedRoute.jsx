import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useRole } from "@/hooks/useRole";
import { clearStoredAuthState, recoverSessionFromCookies } from "@/utils/authSession";
import {
  isOnboardingExemptPath,
  readCachedOnboardingDestination,
  resolvePostAuthDestination,
} from "@/utils/postAuthRoute";

/** @param {{ children: import('react').ReactNode; allowedRoles: string[] }} props */
const RoleProtectedRoute = ({ children, allowedRoles }) => {
  const { roleName } = useRole();
  const currentRole = (roleName || "").trim().toLowerCase();
  const location = useLocation();
  const API_BASE = import.meta.env.VITE_API_BASE;

  // No role in localStorage doesn't always mean "logged out". After a full-page
  // OAuth round-trip (Connect Email) the browser can land on a sibling origin
  // (apex vs www) whose localStorage is a separate, empty store even though the
  // HttpOnly auth cookies are still valid. Before bouncing to /login we try to
  // re-hydrate identity from those cookies. "checking" -> show a spinner;
  // "failed" -> the session is genuinely gone, clear it (which breaks the
  // /login <-> /dashboard loop) and redirect.
  const [recovery, setRecovery] = useState("checking");
  useEffect(() => {
    if (currentRole) return;
    let cancelled = false;
    setRecovery("checking");
    recoverSessionFromCookies(API_BASE).then((ok) => {
      if (cancelled) return;
      if (ok) {
        // role is now in storage; bump state to force a re-render so useRole()
        // re-reads it and the children render instead of /login.
        setRecovery("recovered");
      } else {
        clearStoredAuthState();
        setRecovery("failed");
      }
    });
    return () => { cancelled = true; };
  }, [currentRole, API_BASE]);

  // Onboarding gate. Skipped on routes that are part of the funnel itself
  // (otherwise the redirect would loop) and on routes where the user has no
  // role yet (handled by the role checks below).
  const exempt = isOnboardingExemptPath(location.pathname);
  const cachedDest = !exempt && currentRole ? readCachedOnboardingDestination() : null;
  const [resolvedDest, setResolvedDest] = useState(cachedDest);
  const [lookupFailed, setLookupFailed] = useState(false);

  useEffect(() => {
    if (exempt || !currentRole) return;
    if (resolvedDest !== null) return;
    const userId = localStorage.getItem("user_id");
    if (!userId) return;
    let cancelled = false;
    resolvePostAuthDestination(API_BASE, userId)
      .then((dest) => { if (!cancelled) setResolvedDest(dest); })
      .catch((err) => {
        if (cancelled) return;
        console.error("onboarding lookup failed:", err);
        setLookupFailed(true);
      });
    return () => { cancelled = true; };
  }, [exempt, currentRole, resolvedDest, API_BASE]);

  if (!currentRole) {
    // Session genuinely expired/absent: only now send to login.
    if (recovery === "failed") {
      return <Navigate to="/login" replace />;
    }
    // Still verifying the cookie session (or just recovered and re-rendering).
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  const normalizedAllowed = (allowedRoles || []).map((/** @type {string} */ role) =>
    String(role || "").trim().toLowerCase()
  );

  // Role present but not permitted on this route: send them to the dashboard
  // (which every role can reach), NOT to /login. Bouncing to /login here would
  // just round-trip back through Login's hasRefreshToken redirect.
  if (normalizedAllowed.length > 0 && !normalizedAllowed.includes(currentRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!exempt) {
    if (lookupFailed) {
      // Don't silently bypass onboarding on a network/API error - that's the
      // exact regression we're guarding against. Force the user to retry.
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-center">
          <div>
            <p className="text-base font-medium text-gray-900">
              Couldn't verify your account status.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Please refresh the page or log in again.
            </p>
          </div>
        </div>
      );
    }

    if (resolvedDest === null) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        </div>
      );
    }

    if (resolvedDest !== "/dashboard" && resolvedDest !== location.pathname) {
      return <Navigate to={resolvedDest} replace />;
    }
  }

  return children;
};

export default RoleProtectedRoute;
