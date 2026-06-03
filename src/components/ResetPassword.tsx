import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { Key } from "lucide-react";
import Turnstile from "./Turnstile";
import { TURNSTILE_ENABLED } from "@/lib/turnstile";

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const resetCaptcha = () => {
    setCaptchaToken("");
    setCaptchaKey((k) => k + 1);
  };
  const API_BASE = import.meta.env.VITE_API_BASE;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }

    if (TURNSTILE_ENABLED && !captchaToken) {
      toast.error("Please complete the captcha.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, turnstileToken: captchaToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Invalid or expired token");
        resetCaptcha();
        return;
      }

      toast.success("Password reset successful");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        Invalid reset link
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-orange-100 to-warmchats-flame/20 px-4">
      <Toaster position="top-right" />
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Key className="w-6 h-6 text-orange-500" />
          <h2 className="text-2xl font-bold text-center text-gray-800">
            Reset Password
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="password"
            placeholder="New password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
          />

          <input
            type="password"
            placeholder="Confirm password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
          />

          <Turnstile
            key={captchaKey}
            onVerify={setCaptchaToken}
            onExpire={() => setCaptchaToken("")}
            onError={() => setCaptchaToken("")}
          />

          <button
            type="submit"
            disabled={loading || (TURNSTILE_ENABLED && !captchaToken)}
            className="w-full py-2.5 bg-linear-to-r from-warmchats-primary to-warmchats-flame text-white rounded-lg font-medium disabled:opacity-60"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
