import { useCallback, useEffect, useState } from "react";
import MainLayout from "./MainLayout";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";

export default function ConnectAccount() {
  const API_BASE = import.meta.env.VITE_API_BASE;
  const token = localStorage.getItem("token");
  const [status, setStatus] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [connection, setConnection] = useState<{
    status: "unknown" | "not_connected" | "active" | "needs_reauth" | "revoked" | "error";
    email_address?: string;
  }>({ status: "unknown" });
  const navigate = useNavigate();
  const location = useLocation();

  // Captured once on first render: if we just came back from a successful
  // Gmail OAuth AND a flow (onboarding/dashboard) stashed a return path, we
  // bounce there immediately below - before MainLayout ever mounts - so the
  // user never sees this page flicker in between.
  const [successReturnPath] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("status") === "success"
      ? localStorage.getItem("gmail_oauth_return")
      : null;
  });

  useEffect(() => {
    if (successReturnPath) localStorage.removeItem("gmail_oauth_return");
  }, [successReturnPath]);

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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get("status");
    if (!result) return;

    if (result === "success") {
      // When we have a return path we redirect immediately (see <Navigate>
      // below), so skip the in-page "add leads?" dialog meant for users who
      // landed here directly from the dashboard.
      if (successReturnPath) return;
      setStatus("Gmail connected successfully");
      loadConnection().then(() => setShowDialog(true));
    } else if (result === "reauth") {
      setStatus("Gmail needs reconnect. Please try again.");
    } else if (result === "expired") {
      setStatus("Connection expired. Please reconnect.");
    } else {
      setStatus("Gmail connection failed. Please try again.");
    }
  }, [location.search, loadConnection, successReturnPath]);

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

  // Came from an onboarding/dashboard flow: go straight back without ever
  // painting this page (prevents the dashboard-then-onboarding flicker).
  if (successReturnPath) {
    return <Navigate to={successReturnPath} replace />;
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

      {showDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full text-center space-y-4">
            <div className="flex justify-center">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold">Connected Successfully!</h3>
            <p>Do you want to add leads now?</p>
            <div className="flex justify-around mt-4">
              <button
                onClick={() => {
                  setShowDialog(false);
                  navigate("/leads");
                }}
                className="bg-orange-500 text-white px-4 py-2 rounded-md hover:bg-green-600"
              >
                Yes
              </button>
              <button
                onClick={() => setShowDialog(false)}
                className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
