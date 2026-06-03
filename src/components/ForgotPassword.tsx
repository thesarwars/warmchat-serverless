import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { Lock } from "lucide-react";
import Turnstile from "./Turnstile";
import { TURNSTILE_ENABLED } from "@/lib/turnstile";

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState("");
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
    if (TURNSTILE_ENABLED && !captchaToken) {
      toast.error("Please complete the captcha.");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken: captchaToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to send reset email");
        resetCaptcha();
        return;
      }

      toast.success("Password reset link sent to your email");
      setEmail("");
      resetCaptcha();
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-orange-100 to-warmchats-flame/20 px-4">
      <Toaster position="top-right" />
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Lock className="w-6 h-6 text-orange-500" />
          <h2 className="text-2xl font-bold text-center text-gray-800">
            Forgot Password
          </h2>
        </div>
        <p className="text-sm text-gray-500 text-center mt-1">
          Enter your email to receive a reset link
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-warmchats-primary"
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
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ForgotPassword;
