import React from "react";
import { ChevronDown, Menu, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NotificationCenter } from "./notifications/NotificationCenter";

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

const Topbar: React.FC<TopbarProps> = ({
  onMenuClick,
  title = "Dashboard",
  forceMenuButton,
}) => {
  const navigate = useNavigate();

  const username = localStorage.getItem("name") || "User";
  const firstLetter = username.charAt(0).toUpperCase();

  const roleId = localStorage.getItem("role_id");
  const rawRole =
    localStorage.getItem("role_name") ||
    (roleId ? ROLE_ID_MAP[roleId] : "") ||
    "";
  const roleLabel = rawRole
    ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1).toLowerCase()
    : "Member";

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
          {/* Left - menu + page title */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 md:flex-none">
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
            <h1 className="hidden min-w-0 truncate text-base font-bold tracking-tight text-[#101828] sm:block md:text-lg">
              {title}
            </h1>
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

          {/* Right - notifications + user */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
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
                  {roleLabel}
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
