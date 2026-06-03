import React, { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { GoogleLogin } from "@react-oauth/google";
import { clearStoredAuthState, hasRefreshToken, storeAuthSession } from "../utils/authSession";
import { getRandomWarmChatsTip } from "../utils/warmChatsTips";
import { useRole } from "@/hooks/useRole";
import { resolvePostAuthDestination } from "../utils/postAuthRoute";
import Turnstile from "./Turnstile";
import { TURNSTILE_ENABLED } from "@/lib/turnstile";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { roleName } = useRole();
  const API_BASE = import.meta.env.VITE_API_BASE;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [tip] = useState(getRandomWarmChatsTip);
  // Turnstile token + a key we bump to force a fresh challenge after each try.
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const resetCaptcha = () => {
    setCaptchaToken("");
    setCaptchaKey((k) => k + 1);
  };

  // If a live session already exists (HttpOnly refresh cookie + auth_active),
  // skip the login screen. We require a resolved role too: a session flag
  // without a role is corrupt state, and redirecting on it alone would bounce
  // off RoleProtectedRoute and loop /login <-> /dashboard forever. Onboarding
  // state is consulted so a half-onboarded user gets sent back into the funnel
  // instead of bypassing it by re-visiting /login.
  useEffect(() => {
    if (!hasRefreshToken() || !roleName) return;
    const userId = localStorage.getItem("user_id");
    if (!userId) return;
    let cancelled = false;
    resolvePostAuthDestination(API_BASE, userId)
      .then((dest) => { if (!cancelled) navigate(dest, { replace: true }); })
      .catch((err) => {
        if (cancelled) return;
        console.error("onboarding lookup failed:", err);
        toast.error("Couldn't verify your account status. Please try again.");
      });
    return () => { cancelled = true; };
  }, [navigate, roleName, API_BASE]);

  const handleAuthSuccess = async (data: { user_id: string | number; is_new_user?: boolean; [key: string]: unknown }) => {
    clearStoredAuthState();

    storeAuthSession(data);
    // Google sign-in lands here for both new accounts (first-time via Login
    // page's Google button) and returning logins. Branch on is_new_user so
    // brand new users don't get a confusing "Welcome back!".
    toast.success(data.is_new_user ? "Account created!" : "Welcome back!");

    try {
      const dest = await resolvePostAuthDestination(API_BASE, data.user_id);
      // replace, not push: drop /login from history so the back button after
      // landing goes to wherever the user came from, not back to the form.
      navigate(dest, { replace: true });
    } catch (err) {
      console.error("onboarding lookup failed:", err);
      toast.error("Couldn't verify your account status. Please try logging in again.");
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (TURNSTILE_ENABLED && !captchaToken) {
      toast.error("Please complete the captcha.");
      return;
    }
    setLoading(true);
    clearStoredAuthState();

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, remember, turnstileToken: captchaToken }),
      });

      const data = await res.json();

      if (!res.ok || !data.user_id) {
        toast.error(data.message || "Invalid credentials");
        resetCaptcha();
        return;
      }

      handleAuthSuccess(data);
    } catch {
      toast.error("Something went wrong. Please try again.");
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (credentialResponse: { credential?: string }) => {
    try {
      clearStoredAuthState();
      const res = await fetch(`${API_BASE}/auth/google-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id_token: credentialResponse.credential,
          remember,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.user_id) {
        toast.error(data.message || "Google login failed");
        return;
      }

      handleAuthSuccess(data);
    } catch {
      toast.error("Google login failed");
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-[#F6F7F9]">
      <Toaster position="top-right" />

      {/* LEFT - FORM CARD */}
      <div className="flex items-center justify-center px-6">
        <div className="w-full max-w-md bg-white rounded-xl shadow-xs p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">
              Welcome back!
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Please log in to your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-600">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-gray-400 outline-hidden"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Password</label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 text-sm focus:ring-1 focus:ring-gray-400 outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center text-sm">
              <label className="flex items-center gap-2 text-gray-500">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Keep me logged in
              </label>

              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="text-gray-500 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <Turnstile
              key={captchaKey}
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken("")}
              onError={() => setCaptchaToken("")}
            />

            <button
              type="submit"
              disabled={loading || (TURNSTILE_ENABLED && !captchaToken)}
              className="w-full py-2.5 rounded-md bg-orange-500 text-white font-medium hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          {/* GOOGLE LOGIN */}
          <div className="my-6 text-center">
            <GoogleLogin onSuccess={handleGoogleLogin} />
          </div>

          <p className="text-center text-sm text-gray-600">
            Do not have an account?{" "}
            <button
              onClick={() => navigate("/signup")}
              className="text-gray-900 font-medium hover:underline"
            >
              Create account
            </button>
            <span className="mx-2 text-gray-400">or</span>
            <button
              onClick={() => navigate("/waitlist")}
              className="text-gray-900 font-medium hover:underline"
            >
              Join the waitlist
            </button>
          </p>
        </div>
      </div>

      {/* RIGHT - INFO PANEL */}
      <div className="hidden md:flex items-center justify-center bg-[#F1F3F5]">
        <div className="bg-white rounded-xl shadow-xs p-24 max-w-md text-center">
          <p className="text-sm text-gray-500 mb-3">
            WarmChats tip
          </p>

          <p className="text-xl font-semibold text-gray-900 leading-relaxed">
            {tip}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;