import React, { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { clearStoredAuthState, storeAuthSession } from "../utils/authSession";

const VerifyEmail: React.FC = () => {
  const API_BASE = import.meta.env.VITE_API_BASE;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const email = localStorage.getItem("email") || "";

  const handledRef = useRef(false);

  useEffect(() => {
    const applyAuth = (data: { user_id?: string | number; [key: string]: unknown }) => {
      if (!data?.user_id || handledRef.current) return;
      handledRef.current = true;
      clearStoredAuthState();
      storeAuthSession(data);

      toast.success("Email verified. Continuing setup...");

      // Auth rides on the HttpOnly cookie now - no Authorization header needed.
      fetch(`${API_BASE}/onboarding/${data.user_id}`, {
        credentials: "include",
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Onboarding fetch failed: ${res.status}`);
          return res.json();
        })
        .then((onboardingData) => {
          const step = Number(onboardingData?.step || 0);
          localStorage.setItem("onboardingStep", step.toString());
          if (onboardingData.is_invited) {
            if (step > 0 && step < 5) {
              navigate("/onboarding-agents-managers");
            } else {
              navigate("/dashboard");
            }
          } else {
            if (step > 0 && step < 5) {
              navigate("/onboarding");
            } else {
              navigate("/dashboard");
            }
          }
        })
        .catch((err) => {
          console.error("onboarding fetch failed:", err);
          navigate("/dashboard");
        });
    };

    const existing = localStorage.getItem("email_verified_payload");
    if (existing) {
      try {
        const payload = JSON.parse(existing);
        if (payload?.type === "email_verified") {
          applyAuth(payload);
        }
      } catch {
        // ignore
      }
    }

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel("warmchats-auth");
      channel.onmessage = (event) => {
        if (event?.data?.type === "email_verified") {
          applyAuth(event.data);
        }
      };
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === "email_verified_payload" && event.newValue) {
        try {
          const payload = JSON.parse(event.newValue);
          if (payload?.type === "email_verified") {
            applyAuth(payload);
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      if (channel) channel.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [API_BASE, navigate]);

  const resendConfirmation = async () => {
    if (!email) {
      toast.error("Missing email address. Please sign up again.");
      navigate("/signup");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/resend-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to resend confirmation email");
      }
      toast.success(data.message || "Confirmation email sent");
    } catch (err) {
      toast.error((err as Error).message || "Failed to resend confirmation email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F7F9] px-6">
      <Toaster position="top-right" />
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xs p-8 text-center space-y-4">
        <Mail className="w-12 h-12 text-orange-500 mx-auto" />
        <h1 className="text-2xl font-semibold text-gray-900">
          Verify your email to continue
        </h1>
        <p className="text-sm text-gray-600">
          We sent a confirmation link to{" "}
          <span className="font-medium text-gray-900">{email || "your email"}</span>.
          Open the email and click the button to verify your account.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={resendConfirmation}
            disabled={loading}
            className="px-5 py-2 rounded-md bg-orange-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Resend confirmation email"}
          </button>
          <button
            onClick={() => navigate("/login")}
            className="px-5 py-2 rounded-md border text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to login
          </button>
        </div>
        <p className="text-xs text-gray-500">
          After verifying, return to this tab and we'll continue automatically.
        </p>
      </div>
    </div>
  );
};

export default VerifyEmail;
