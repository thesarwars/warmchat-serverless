import React from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Home,
  Mail,
  Menu,
  MessageSquare,
  Search,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NotificationCenter } from "./notifications/NotificationCenter";
import { useFetch } from "@/helpers/hooks";
import { fetchMeBootstrap, type MeBootstrap } from "@/helpers/backend";

interface TopbarProps {
  onUpgradeClick?: () => void;
  onMenuClick?: () => void;
  title?: string;
  forceMenuButton?: boolean;
}

const ROLE_ID_MAP: Record<string, string> = {
  "1": "Guest",
  "2": "Owner",
  "3": "Representative",
  "4": "Manager",
};

// A connection status pill: green "X Connected" with a check when connected,
// otherwise a clickable amber "Connect X" that routes to the setup flow.
const ConnPill: React.FC<{
  label: string;
  connected: boolean;
  icon: React.ReactNode;
  onConnect: () => void;
}> = ({ label, connected, icon, onConnect }) =>
  connected ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C7E0CE] bg-[#E8F1EA] px-3 py-1 text-xs font-semibold text-[#1F7A52]">
      <Check className="h-3.5 w-3.5" />
      {label} Connected
    </span>
  ) : (
    <button
      type="button"
      onClick={onConnect}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#FBD9BE] bg-[#FFF3EA] px-3 py-1 text-xs font-semibold text-[#B9450A] transition hover:bg-[#FDE0C9]"
    >
      {icon}
      Connect {label}
    </button>
  );

const Topbar: React.FC<TopbarProps> = ({
  onMenuClick,
  title = "Dashboard",
  forceMenuButton,
}) => {
  const navigate = useNavigate();

  const username = localStorage.getItem("name") || "User";
  const firstLetter = username.charAt(0).toUpperCase();
  const orgName = localStorage.getItem("org_name") || "";

  const roleId = localStorage.getItem("role_id");
  const rawRole =
    localStorage.getItem("role_name") ||
    (roleId ? ROLE_ID_MAP[roleId] : "") ||
    "";
  const roleLabel = rawRole
    ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1).toLowerCase()
    : "Member";
  const roleLine = orgName ? `${roleLabel} · ${orgName}` : roleLabel;

  // Channel connection state for the two status pills. Shares the ["me_bootstrap"]
  // query key with the dashboard, so React Query serves it from cache (no extra
  // request on the dashboard; one cheap request elsewhere).
  const hasToken = Boolean(localStorage.getItem("token"));
  const { data: meBootstrap } = useFetch<MeBootstrap>(
    ["me_bootstrap"],
    () => fetchMeBootstrap(),
    {},
    { enabled: hasToken, staleTime: 1000 * 60 * 2 },
  );
  const emailConnected = Boolean(
    (meBootstrap?.channels?.email as { connected?: boolean } | undefined)?.connected,
  );
  const smsConnected = Boolean(meBootstrap?.phone_number?.phone_number);
  const plan = (meBootstrap?.billing as { plan?: string } | null | undefined)?.plan ?? null;
  const hasSmsAccess = Boolean(plan) && plan !== "free_channel";

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-[#EAEAEA] bg-white">
      <div className="flex h-full items-stretch">
        {/* Brand column - aligns with the sidebar width */}
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          aria-label="Go to dashboard"
          className="hidden shrink-0 items-center gap-2.5 border-r border-[#EAEAEA] px-5 transition hover:bg-[#F9FAFB] lg:flex lg:w-72"
        >
          <img
            src="/icon.png"
            alt=""
            className="h-11 w-11 shrink-0 object-contain"
          />
          <span className="text-xl font-bold tracking-tight">WarmChats</span>
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
          {/* Left - menu + breadcrumb (home > title) */}
          <div className="flex min-w-0 items-center gap-1.5">
            {onMenuClick && (
              <button
                type="button"
                onClick={onMenuClick}
                className={`-ml-1 shrink-0 rounded-lg p-2 text-[#344054] transition hover:bg-[#F2F4F7] ${
                  forceMenuButton ? "" : "lg:hidden"
                }`}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <nav className="hidden min-w-0 items-center gap-1.5 sm:flex" aria-label="Breadcrumb">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                aria-label="Dashboard home"
                className="shrink-0 rounded-md p-1 text-[#98A2B3] transition hover:bg-[#F2F4F7] hover:text-[#475467]"
              >
                <Home className="h-4 w-4" />
              </button>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#CDD3DD]" />
              <span className="min-w-0 truncate text-base font-bold tracking-tight text-[#101828] md:text-lg">
                {title}
              </span>
            </nav>
          </div>

          {/* Center - search */}
          <form
            className="hidden min-w-0 flex-1 md:block"
            onSubmit={(e) => e.preventDefault()}
            role="search"
          >
            <div className="relative mx-auto max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="search"
                placeholder="Search leads, contacts, conversations..."
                className="h-9 w-full rounded-lg border border-[#EAEAEA] bg-[#F9FAFB] pl-9 pr-3 text-sm text-[#101828] outline-none transition placeholder:text-[#98A2B3] focus:border-[#FF6B35] focus:bg-white"
              />
            </div>
          </form>

          {/* Right - connection pills + notifications + user */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
            <div className="hidden items-center gap-2 xl:flex">
              <ConnPill
                label="Email"
                connected={emailConnected}
                icon={<Mail className="h-3.5 w-3.5" />}
                onConnect={() => navigate("/connect-email")}
              />
              <ConnPill
                label="SMS"
                connected={smsConnected}
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                onConnect={() => navigate(hasSmsAccess ? "/connect-phone" : "/upgrade")}
              />
            </div>

            <NotificationCenter />

            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="flex items-center gap-2 rounded-lg p-1 pr-1.5 transition hover:bg-[#F9FAFB]"
              title={username}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-[#FF8A5C] to-[#FF6B35] text-sm font-semibold text-white ring-2 ring-[#F2F4F7] sm:h-10 sm:w-10">
                {firstLetter}
              </span>
              <span className="hidden min-w-0 text-left leading-tight sm:block">
                <span className="block truncate text-sm font-semibold text-[#101828]">
                  {username}
                </span>
                <span className="block truncate text-xs text-[#667085]">
                  {roleLine}
                </span>
              </span>
              <ChevronDown className="hidden h-4 w-4 shrink-0 text-[#667085] sm:block" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
