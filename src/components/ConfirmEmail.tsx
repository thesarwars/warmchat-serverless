import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";

type VerifyPayload = {
  type: "email_verified";
  access_token?: string;
  refresh_token?: string;
  user_id?: string | number;
  name?: string;
  email?: string;
  role_id?: string | number;
  role_name?: string;
  org_id?: string | number;
  org_name?: string;
};

export default function ConfirmEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const API_BASE = import.meta.env.VITE_API_BASE;
  const calledRef = useRef(false); // Prevent double API calls in Strict Mode
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("Confirming your email...");

  const notifyOriginalTab = (payload: VerifyPayload) => {
    try {
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel("warmchats-auth");
        channel.postMessage(payload);
        channel.close();
      }
    } catch (err) {
      console.error("BroadcastChannel failed", err);
    }

    try {
      localStorage.setItem("email_verified_payload", JSON.stringify(payload));
      localStorage.setItem("email_verified_at", String(Date.now()));
    } catch (err) {
      console.error("localStorage notification failed", err);
    }
  };

  useEffect(() => {
    if (!token || calledRef.current) return;
    calledRef.current = true;

    fetch(`${API_BASE}/auth/confirm-email?token=${token}`, {
      method: "GET",
    })
      .then(async (res) => {
        type ConfirmData = {
          message?: string;
          access_token?: string;
          refresh_token?: string;
          user_id?: string | number;
          name?: string;
          email?: string;
          role_id?: number;
          role_name?: string;
          org_id?: number;
          org_name?: string;
        };
        let data: ConfirmData;
        try {
          data = (await res.json()) as ConfirmData;
        } catch {
          data = {};
        }
        if (!res.ok) {
          throw new Error(data.message || "Email confirmation failed");
        }
        return data;
      })
      .then((data) => {
        toast.success("Email confirmed successfully");
        setStatus("success");
        setMessage("Email verified. Return to the tab where you started signup to continue onboarding.");

        const payload: VerifyPayload = {
          type: "email_verified",
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user_id: data.user_id,
          name: data.name,
          email: data.email,
          role_id: data.role_id,
          role_name: data.role_name,
          org_id: data.org_id,
          org_name: data.org_name,
        };
        notifyOriginalTab(payload);

        setTimeout(() => {
          try {
            window.close();
          } catch {
            // ignore if browser blocks close
          }
        }, 800);
      })
      .catch((ex) => {
        console.error(ex);
        setStatus("error");
        setMessage(ex.message || "Email confirmation failed");
        toast.error(ex.message || "Email confirmation failed");
      });
  }, [token, API_BASE]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <p className="text-lg font-medium mb-4">{message}</p>
      {status === "success" && (
        <p className="text-sm text-gray-600">You can close this tab after verification.</p>
      )}
      {status === "error" && (
        <p className="text-sm text-gray-600">Try requesting a new confirmation email.</p>
      )}
      <div className="p-8">
        <Toaster position="top-right" />
      </div>
    </div>
  );
}
