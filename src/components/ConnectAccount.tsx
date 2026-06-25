import { useCallback, useEffect, useState } from "react";
import MainLayout from "./MainLayout";
import { Navigate, useLocation } from "react-router-dom";

export default function ConnectAccount() {
  const API_BASE = import.meta.env.VITE_API_BASE;
  const token = localStorage.getItem("token");
  const [status, setStatus] = useState("");
  const [connection, setConnection] = useState<{
    status: "unknown" | "not_connected" | "active" | "needs_reauth" | "revoked" | "error";
    email_address?: string;
  }>({ status: "unknown" });
  const location = useLocation();

  // Captured once on first render. On a successful OAuth return we redirect
  // immediately (guard below) - this page is NEVER painted on success, so the
  // user never sees a standalone connect screen. successReturnPath is the path a
  // flow (onboarding) stashed before starting OAuth; a direct connect has none
  // and is sent to the dashboard, which shows the success toast + add-leads prompt.
  const [oauthSuccess] = useState(
    () => new URLSearchParams(window.location.search).get("status") === "success",
  );
  const [successReturnPath] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("status") === "success"
      ? localStorage.getItem("gmail_oauth_return")
      : null,
  );

  useEffect(() => {
    if (oauthSuccess) localStorage.removeItem("gmail_oauth_return");
  }, [oauthSuccess]);

  const loadConnection = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/gmail/connection`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setConnection({ status: data.status || "not_connected", email_address: data.email_address });
      } else {
        setConnection({ status: "error" });
      }
    } catch {
      setConnection({ status: "error" });
    }
  }, [API_BASE, token]);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  // Non-success OAuth returns (reauth/expired/failed) surface a message on the card.
  useEffect(() => {
    const result = new URLSearchParams(location.search).get("status");
    if (!result || result === "success") return;
    if (result === "reauth") setStatus("Gmail needs reconnect. Please try again.");
    else if (result === "expired") setStatus("Connection expired. Please reconnect.");
    else setStatus("Gmail connection failed. Please try again.");
  }, [location.search]);

  const startOAuth = async () => {
    if (!token) {
      setStatus("Missing authentication token. Please log in again.");
      return;
    }

    setStatus("Redirecting to Google...");

    try {
      const res = await fetch(`${API_BASE}/gmail/connect-url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setStatus("Failed to start Gmail connect");
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      console.error("Error connecting Gmail:", err);
      setStatus("Network or server error");
    }
  };

  const disconnect = async () => {
    if (!token) return;
    try {
      await fetch(`${API_BASE}/gmail/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setConnection({ status: "not_connected" });
      setStatus("Disconnected");
    } catch {
      setStatus("Failed to disconnect");
    }
  };

  // Just returned from a successful OAuth: never paint this page (this is what
  // removed the full-black "Connected Successfully" screen). Onboarding/dashboard
  // flows stashed a return path -> go straight back there. A direct connect lands
  // on /dashboard, which shows a success toast + the "add leads?" prompt inside
  // the normal app UI (DashboardV2 reads the router state below).
  if (oauthSuccess) {
    return successReturnPath ? (
      <Navigate to={successReturnPath} replace />
    ) : (
      <Navigate to="/dashboard" replace state={{ gmailConnected: true }} />
    );
  }

  const isActive = connection.status === "active";
  const needsReconnect = connection.status === "needs_reauth";

  return (
    <MainLayout>
      <div className="max-w-md mx-auto mt-12 bg-white shadow-md rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Connect Gmail</h2>
        <p className="text-sm text-gray-600">
          Connect Gmail with OAuth to send and track replies. No app passwords.
        </p>

        {isActive ? (
          <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
            Connected as {connection.email_address}
          </div>
        ) : needsReconnect ? (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-700">
            Reconnect Gmail to continue sending and tracking replies.
          </div>
        ) : null}

        <div className="flex gap-3">
          <button
            onClick={startOAuth}
            className="flex-1 bg-orange-500 text-white p-2 rounded-md hover:bg-orange-600"
          >
            {isActive ? "Reconnect" : "Connect Gmail"}
          </button>
          {isActive && (
            <button
              onClick={disconnect}
              className="flex-1 bg-gray-100 text-gray-800 p-2 rounded-md hover:bg-gray-200"
            >
              Disconnect
            </button>
          )}
        </div>

        {status && <p className="text-sm text-gray-700 mt-2">{status}</p>}
      </div>
    </MainLayout>
  );
}
