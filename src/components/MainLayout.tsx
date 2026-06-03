import React, { useEffect, useState } from "react";
import Sidebar from "../components/SideBar";
import Topbar from "../components/Topbar";
import { IncomingCallModal } from "./calling/IncomingCallModal";
import { ActiveCallWindow } from "./calling/ActiveCallWindow";
import { MissedWhileBusyToast } from "./calling/MissedWhileBusyToast";
import { useFetch } from "@/helpers/hooks";
import { fetchGmailConnection, fetchBusinessEmailStatus } from "@/helpers/backend";

interface MainLayoutProps {
  children: React.ReactNode;
  hideSidebar?: boolean;
  title?: string;
  onUpgradeClick?: () => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  hideSidebar,
  title,
  onUpgradeClick,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (hideSidebar) return false;
    if (typeof window === "undefined") return false;
    return window.innerWidth >= 1024;
  });
  const showSidebar = !hideSidebar;
  const hasToken = Boolean(localStorage.getItem("token"));

  // These drive a reconnect banner only - they don't gate any visible content
  // on first paint. Defer enabling the queries until after the dashboard's
  // initial render wave so they don't compete for connections during cold
  // load. React Query handles the rest (cache, focus refetch).
  const [integrationsReady, setIntegrationsReady] = useState(false);
  useEffect(() => {
    if (!hasToken) return;
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    const fire = () => setIntegrationsReady(true);
    const handle: number | ReturnType<typeof setTimeout> =
      typeof ric === "function" ? ric(fire, { timeout: 2000 }) : setTimeout(fire, 1200);
    return () => {
      const cancelRic = (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (typeof ric === "function" && typeof cancelRic === "function") cancelRic(handle as number);
      else clearTimeout(handle as ReturnType<typeof setTimeout>);
    };
  }, [hasToken]);

  const { data: gmailData } = useFetch<{ status?: string; email_address?: string }>(
    ["gmail-connection"],
    () => fetchGmailConnection(),
    {},
    { enabled: hasToken && integrationsReady, staleTime: 1000 * 60 * 5 },
  );
  const { data: domainData } = useFetch<{ status?: string }>(
    ["business-email-status"],
    () => fetchBusinessEmailStatus(),
    {},
    { enabled: hasToken && integrationsReady, staleTime: 1000 * 60 * 5 },
  );

  const gmailStatus = gmailData?.status ?? "unknown";
  const gmailEmail = gmailData?.email_address ?? null;
  const hasVerifiedBusinessEmail = domainData?.status === "verified";

  const startReconnect = async () => {
    const token = localStorage.getItem("token");
    const API_BASE = import.meta.env.VITE_API_BASE;
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/gmail/connect-url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.url) window.location.href = data.url;
    } catch {
      return;
    }
  };

  const toggleSidebar = () => setIsSidebarOpen((o) => !o);

  return (
    <div className="min-h-screen">
      <Topbar
        title={title}
        onUpgradeClick={onUpgradeClick}
        onMenuClick={toggleSidebar}
        forceMenuButton={!showSidebar}
      />

      <Sidebar
        isOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        floatingOnDesktop={!showSidebar}
      />

      <main className={showSidebar ? "pt-16 overflow-x-hidden lg:pl-72" : "pt-16 overflow-x-hidden"}>
        <div className="min-w-0 overflow-x-hidden lg:py-0 lg:p-2 lg:pb-0">
          {gmailStatus === "needs_reauth" && !hasVerifiedBusinessEmail && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              <span>
                Reconnect Gmail to continue sending and tracking replies
                {gmailEmail ? ` (${gmailEmail})` : ""}.
              </span>
              <button
                onClick={startReconnect}
                className="shrink-0 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
              >
                Reconnect Gmail
              </button>
            </div>
          )}
          {children}
        </div>
      </main>

      <IncomingCallModal />
      <ActiveCallWindow />
      <MissedWhileBusyToast />
    </div>
  );
};

export default MainLayout;