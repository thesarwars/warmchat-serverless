import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Route guard for the per-ORG business admin panel (/admin): Overview, Users,
 * Messaging, Goals, Integrations, Billing & Usage. Visible to an org's
 * Owner/Manager (role_name) OR the platform owner (is_admin). The data behind it
 * is org-scoped server-side (isOrgMember / requireCallerOrgRole + WHERE org_id),
 * so an org admin only ever sees their OWN org.
 *
 * The PLATFORM super-admin tools (/admin/tools, /admin/debug, /admin/blocked) use
 * AdminProtectedRoute (is_admin) instead - those stay owner-only.
 *
 * This is a UX gate only; every /admin business endpoint re-enforces the role +
 * org-scope server-side, so a forged localStorage role can't actually read data.
 */
const ORG_ADMIN_ROLES = new Set(["Owner", "Manager"]);

export default function OrgAdminRoute({ children }: { children: ReactNode }) {
  if (typeof window === "undefined") return <>{children}</>;
  const authActive = localStorage.getItem("auth_active") === "1";
  if (!authActive) return <Navigate to="/login" replace />;
  const isAdmin = localStorage.getItem("is_admin") === "1";
  const role = localStorage.getItem("role_name") || "";
  if (!isAdmin && !ORG_ADMIN_ROLES.has(role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
