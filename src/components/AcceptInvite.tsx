import React, { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import Turnstile from "./Turnstile";
import { TURNSTILE_ENABLED } from "@/lib/turnstile";

export default function AcceptInvite(): React.ReactElement {
  const API_BASE = import.meta.env.VITE_API_BASE as string;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get("token");

  const [name, setName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [captchaToken, setCaptchaToken] = useState<string>("");
  const [captchaKey, setCaptchaKey] = useState<number>(0);
  const resetCaptcha = () => {
    setCaptchaToken("");
    setCaptchaKey((k) => k + 1);
  };

  const submit = async (): Promise<void> => {
    if (!token) {
      toast.error("Invalid invite link");
      return;
    }

    if (!name || !password || !confirmPassword) {
      toast.error("All fields are required");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (TURNSTILE_ENABLED && !captchaToken) {
      toast.error("Please complete the captcha.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE}/auth/accept-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name,
          password,
          turnstileToken: captchaToken,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        toast.error(result.message || "Invite invalid or expired");
        resetCaptcha();
        return;
      }

      toast.success("Invitation accepted. You can now Onboard.");
      navigate("/onboarding");
    } catch {
      toast.error("Something went wrong");
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Toaster />

      <div className="bg-white p-6 rounded shadow-sm w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Accept Invitation</h2>

        <input
          className="border p-2 w-full mb-3 rounded"
          placeholder="Your full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          type="password"
          className="border p-2 w-full mb-3 rounded"
          placeholder="Create password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <input
          type="password"
          className="border p-2 w-full mb-4 rounded"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <div className="mb-4">
          <Turnstile
            key={captchaKey}
            onVerify={setCaptchaToken}
            onExpire={() => setCaptchaToken("")}
            onError={() => setCaptchaToken("")}
          />
        </div>

        <button
          onClick={submit}
          disabled={loading || (TURNSTILE_ENABLED && !captchaToken)}
          className="bg-black text-white w-full py-2 rounded disabled:opacity-50"
        >
          {loading ? "Processing..." : "Accept Invitation"}
        </button>
      </div>
    </div>
  );
}
