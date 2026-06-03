import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Route guard for /admin/* pages. Gates on the site-wide `is_admin` flag
 * (set by the backend via `user.is_admin`, stored in localStorage by
 * `storeAuthSession`). This is intentionally NOT a per-org role check -
 * only specific humans (jv@jovrealestate.com today) get admin powers.
 */
export default function AdminProtectedRoute({ children }: { children: ReactNode }) {
  const isAdmin = typeof window !== "undefined" && localStorage.getItem("is_admin") === "1";
  const authActive = typeof window !== "undefined" && localStorage.getItem("auth_active") === "1";
  if (!authActive) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
