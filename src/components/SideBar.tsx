import React from "react";
import {
  LayoutGrid,
  User,
  MessageSquare,
  Bot,
  Settings,
  LogOut,
  ChevronDown,
  Users2,
  UsersRound,
  Building2,
  GitFork,
  CalendarDays,
  ListChecks,
  Tag,
  BarChart3,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ROLES } from "../constants/roles";
import { logoutCurrentSession } from "../utils/authSession";
import { usePlan } from "@/helpers/usePlan";
import { fetchInboxContacts, fetchLeadSummary } from "@/helpers/backend";
import GettingStartedChecklist from "./GettingStartedChecklist";

// Mirrors the seed order in sql/100.seed.sql:
//   INSERT INTO role (name) VALUES ('Owner'), ('Manager'), ('Representative'), ('Guest');
// so the row ids are deterministic across fresh DB resets.
const ROLE_ID_MAP: Record<string, string> = {
  "1": "Owner",
  "2": "Manager",
  "3": "Representative",
  "4": "Guest",
};

const canonicalizeRole = (value?: string | null) => {
  if (!value) return "Guest";
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return "Guest";
  if (cleaned === "admin" || cleaned === "owner") return "Owner";
  if (cleaned === "manager") return "Manager";
  if (cleaned === "representative" || cleaned === "rep")
    return "Representative";
  if (cleaned === "guest") return "Guest";
  return value.trim();
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface SideBarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  floatingOnDesktop?: boolean;
}

type IconComponent = React.ComponentType<{ className?: string }>;

// ─── Main Component ───────────────────────────────────────────────────────────

function SideBar({ isOpen, toggleSidebar, floatingOnDesktop }: SideBarProps) {
  const API_BASE = import.meta.env.VITE_API_BASE;

  const roleIdRaw = localStorage.getItem("role_id");
  const roleNameRaw = localStorage.getItem("role_name");
  const roleNameFromId = roleIdRaw ? (ROLE_ID_MAP[roleIdRaw] ?? "") : "";
  const roleName = canonicalizeRole(roleNameRaw || roleNameFromId);

  const role =
    roleName === "Owner"
      ? ROLES.ADMIN
      : roleName === "Manager"
        ? ROLES.MANAGER
        : roleName === "Representative"
          ? ROLES.REPRESENTATIVE
          : ROLES.GUEST;

  const { isBroker } = usePlan();

  // ─── Nav counters ─────────────────────────────────────────────────────────
  // Reuse the same query keys the Dashboard/Leads/Inbox pages use so the
  // sidebar piggybacks on their cache instead of firing extra round-trips.
  const hasToken = Boolean(localStorage.getItem("token"));
  const orgId = localStorage.getItem("org_id");

  const { data: inboxData } = useQuery<{ contacts?: { total_unread_count?: number }[] }>({
    queryKey: ["inbox_contacts"],
    queryFn: () => fetchInboxContacts(),
    enabled: hasToken,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });
  const inboxUnread = (inboxData?.contacts ?? []).reduce(
    (sum, c) => sum + Number(c.total_unread_count || 0),
    0,
  );

  const { data: leadSummary } = useQuery<{ total_leads?: number }>({
    queryKey: ["lead_summary", orgId],
    queryFn: () => fetchLeadSummary(orgId as string),
    enabled: hasToken && Boolean(orgId),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });
  const leadsCount = Number(leadSummary?.total_leads || 0);

  // Tasks is a stub for now - no data source yet, so its badge stays hidden
  // (NavItem only renders a badge when the count is > 0).
  const tasksCount = 0;

  const canView = (allowedRoles: string[]) => allowedRoles.includes(role);

  const handleLogout = async () => {
    await logoutCurrentSession(API_BASE);
    // Full-document replace to the homepage rather than an SPA navigate:
    // - replaces the current /dashboard entry so back doesn't re-open the app
    // - hard reload tears down authed React state / open websockets cleanly
    // Any deeper protected entries still in the back stack are bounced by
    // RoleProtectedRoute once the session is gone.
    window.location.replace("/");
  };

  const username = localStorage.getItem("name") || "User";
  const firstLetter = username.charAt(0).toUpperCase();
  const nameParts = username.trim().split(/\s+/);
  const displayName =
    nameParts.length > 1
      ? `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0).toUpperCase()}.`
      : username;
  const roleLabel =
    roleName === "Owner"
      ? "Admin"
      : roleName === "Manager"
        ? "Manager"
        : roleName === "Representative"
          ? "Representative"
          : "Guest";

  // Inbox unread badge disabled per old-repo change (commit 6686ad1).
  // The previous React Query-backed badge fetched every 60s; the upstream
  // change removed the badge entirely. Re-enable by restoring the useQuery
  // block and `badge={...}` prop on the Inbox NavItem.
  // const { data: contactsRaw } = useQuery({
  //   queryKey: ["inbox-contacts"],
  //   queryFn: () => fetchInboxContacts(),
  //   enabled: Boolean(localStorage.getItem("token") && API_BASE),
  //   refetchInterval: 60_000,
  //   staleTime: 1000 * 60 * 2,
  // });
  // const inboxUnread = useMemo(() => {
  //   const data = contactsRaw as { contacts?: InboxContact[] } | InboxContact[] | undefined;
  //   const contacts: InboxContact[] = Array.isArray(data) ? data : (data?.contacts ?? []);
  //   return contacts.reduce((sum, c) => sum + Number(c.total_unread_count || 0), 0);
  // }, [contactsRaw]);

  const mainNavItems = (
    <>
      <NavItem to="/dashboard" icon={LayoutGrid} text="Dashboard" />
      <NavItem to="/leads" icon={User} text="Leads" badge={leadsCount} badgeTone="neutral" />
      <NavItem to="/inbox" icon={MessageSquare} text="Inbox" badge={inboxUnread} />
      <NavItem to="/tasks" icon={ListChecks} text="Tasks" badge={tasksCount} />
      <NavItem to="/appointments" icon={CalendarDays} text="Calendar" />
    </>
  );

  // AI section - the single AI Agent command center (Overview / Activity /
  // Inbound / Outbound / Action Center / Knowledge Base / AI Settings). The old
  // per-agent pages were removed.
  const aiNavItems = (
    <Section title="AI" isNew>
      <NavItem to="/ai/agent" icon={Bot} text="AI Agent" dot="#78bee6" />
    </Section>
  );

  const teamNavItems = (
    <Section title="Team">
      <NavItem to="/team/users"        icon={Users2}     text="Users"         />
      <NavItem to="/team/teams"        icon={UsersRound} text="Teams"         />
      <NavItem to="/team/offices"      icon={Building2}  text="Offices"       />
      <NavItem to="/team/lead-routing" icon={GitFork}    text="Lead Routing"  />
    </Section>
  );

  // Account & Usage, Billing, and Connected Accounts are now tabs inside the
  // single /settings page, so the sidebar links to it once. Support stays a
  // standalone help page.
  const settingsNavItems = (
    <Section title="Workspace">
      <NavItem to="/deals" icon={Tag} text="Deals" />
      {/* Site admins get the Admin control center (Settings folded into its Users
          tab) - one unified entry. The standalone Settings page is retired, so
          non-admins get no Workspace settings link. */}
      {typeof window !== "undefined" && localStorage.getItem("is_admin") === "1" ? (
        <NavItem to="/admin" icon={BarChart3} text="Admin" />
      ) : null}
      {/* <NavItem to="/dashboard/support" icon={LifeBuoy} text="Support" /> */}
    </Section>
  );

  return (
    <>
      {/* Backdrop (mobile always; desktop too when sidebar is floating) */}
      {isOpen && (
        <div
          className={`fixed inset-x-0 bottom-0 top-16 z-30 bg-black/30 ${
            floatingOnDesktop ? "" : "lg:hidden"
          }`}
          onClick={toggleSidebar}
          aria-hidden
        />
      )}

      <aside
        className={`fixed bottom-0 left-0 top-16 z-40 flex w-[min(100vw-1rem,15rem)] max-w-60 flex-col border-r border-[#EAEAEA] bg-white transition-transform supports-[padding:max(0px)]:pb-[env(safe-area-inset-bottom)] sm:w-60 ${
          floatingOnDesktop ? "" : "lg:translate-x-0"
        } ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex-1 min-h-0 space-y-6 overflow-y-auto overflow-x-hidden px-3 py-5 text-sm font-medium">
          {canView([
            ROLES.ADMIN,
            ROLES.MANAGER,
            ROLES.REPRESENTATIVE,
            ROLES.GUEST,
          ]) && <ul className="space-y-1">{mainNavItems}</ul>}

          {canView([
            ROLES.ADMIN,
            ROLES.MANAGER,
            ROLES.REPRESENTATIVE,
            ROLES.GUEST,
          ]) && aiNavItems}

          {canView([ROLES.ADMIN, ROLES.MANAGER]) && isBroker && teamNavItems}

          {canView([
            ROLES.ADMIN,
            ROLES.MANAGER,
            ROLES.REPRESENTATIVE,
            ROLES.GUEST,
          ]) &&
            settingsNavItems}

          {/* Admin tools live at /admin (Debug Logs, Blocked Numbers). That hub
              is intentionally not linked here - it's reachable only by typing
              the URL, and the route itself is gated on the site-wide is_admin
              flag via AdminProtectedRoute. */}
        </div>

        {canView([
          ROLES.ADMIN,
          ROLES.MANAGER,
          ROLES.REPRESENTATIVE,
          ROLES.GUEST,
        ]) && (
          <div className="shrink-0 px-3 py-4">
            {/* Setup progress lives full-width here; opening it pops the
                floating checklist panel (fixed-position) over the content. */}
            <GettingStartedChecklist />
            <div className="flex items-center gap-2">
              <NavLink
                to="/settings"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[#F9FAFB]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#FF8A5C] to-[#FF6B35] text-sm font-semibold text-white">
                  {firstLetter}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[#101828]">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-[#667085]">{roleLabel}</p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#98A2B3]" />
              </NavLink>
              <button
                type="button"
                onClick={handleLogout}
                className="shrink-0 rounded-lg p-2.5 text-[#667085] transition hover:bg-[#F2F4F7] hover:text-[#101828]"
                aria-label="Log out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Section = ({
  title,
  children,
  isNew,
}: {
  title: string;
  children: React.ReactNode;
  isNew?: boolean;
}) => (
  <div>
    <div className="mb-2 flex items-center gap-2 px-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#98A2B3]">
        {title}
      </span>
      {isNew && (
        <span className="rounded-full bg-[#FF6B35] px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide text-white">
          New
        </span>
      )}
    </div>
    <ul className="space-y-1">{children}</ul>
  </div>
);

const NavItem = ({
  to,
  icon: Icon,
  text,
  badge,
  badgeTone = "accent",
  dot,
}: {
  to: string;
  icon: IconComponent;
  text: string;
  badge?: number;
  /** "accent" = orange attention pill (unread/open); "neutral" = gray total. */
  badgeTone?: "accent" | "neutral";
  /** Optional live-status dot color (used by the AI agent items). */
  dot?: string;
}) => (
  <li>
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition",
          isActive
            ? "bg-[#FFF1EC] font-semibold text-[#FF6B35]"
            : "text-[#344054] hover:bg-[#F9FAFB]",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={`h-5 w-5 shrink-0 ${
              isActive ? "text-[#FF6B35]" : "text-[#667085]"
            }`}
          />
          <span className="flex-1">{text}</span>
          {dot && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: dot }}
              aria-hidden
            />
          )}
          {badge != null && badge > 0 && (
            <span
              className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                badgeTone === "neutral"
                  ? "bg-[#F2F4F7] text-[#475467]"
                  : "bg-[#FF6B35] text-white"
              }`}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  </li>
);

export default SideBar;
