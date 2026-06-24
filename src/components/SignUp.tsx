import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { GoogleLogin } from "@react-oauth/google";
import { clearStoredAuthState, hasRefreshToken, storeAuthSession } from "../utils/authSession";
import { track } from "../lib/mixpanel";
import { getRandomWarmChatsTip } from "../utils/warmChatsTips";
import { resolvePostAuthDestination } from "../utils/postAuthRoute";
import { useRole } from "@/hooks/useRole";
import Turnstile from "./Turnstile";
import { TURNSTILE_ENABLED } from "@/lib/turnstile";

const Signup: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Terms + privacy consent. Required for registration (TCPA/contract-formation
  // audit) - server refuses the call with code: "TERMS_NOT_ACCEPTED" when false.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tip] = useState(getRandomWarmChatsTip);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const resetCaptcha = () => {
    setCaptchaToken("");
    setCaptchaKey((k) => k + 1);
  };

  // Optional promo code (validated against Stripe). The discount only applies at
  // paid-plan checkout - here we just validate + remember the code so it can be
  // pre-applied when the user upgrades.
  const [promo, setPromo] = useState("");
  const [promoStatus, setPromoStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [promoDesc, setPromoDesc] = useState("");

  const API_BASE = import.meta.env.VITE_API_BASE;
  const navigate = useNavigate();
  const { roleName } = useRole();

  // Plan picked on the public pricing page (?plan=starter|growth). Free plans
  // carry no param and go straight to onboarding; paid plans must pay first.
  const PAID_PLANS = ["starter", "growth"];
  const selectedPlan = (new URLSearchParams(window.location.search).get("plan") || "").toLowerCase();
  const isPaidPlan = PAID_PLANS.includes(selectedPlan);

  // Kick off Stripe checkout for a paid plan. successPath threads through Stripe
  // -> /billing/success so the user lands in onboarding (SMS + email) once paid.
  // Returns true if we redirected to Stripe (caller should stop).
  const startCheckoutForPlan = async (planId: string, successPath: string = "/onboarding"): Promise<boolean> => {
    try {
      const promoCode = (promoStatus === "valid" && promo.trim()) || localStorage.getItem("wc_promo_code") || "";
      const res = await fetch(`${API_BASE}/billing/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId, cancelPath: "/pricing", successPath, promoCode }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.assign(data.checkout_url);
        return true;
      }
      // 100%-off promo: comped instantly in D1, no Stripe. Route through the
      // success page (which clears the promo + lands them in onboarding).
      if (data.comped) {
        window.location.assign(
          `/billing/success?comped=1&plan=${encodeURIComponent(data.plan || planId)}&return=${encodeURIComponent(successPath)}`,
        );
        return true;
      }
    } catch (err) {
      console.error("checkout init failed:", err);
    }
    return false;
  };

  // Already-logged-in users that browse to /signup should not see the form
  // again - bounce them to onboarding or the dashboard depending on progress.
  useEffect(() => {
    if (!hasRefreshToken() || !roleName) return;
    const userId = localStorage.getItem("user_id");
    if (!userId) return;
    let cancelled = false;
    // Already signed in and arriving with a paid plan selected (e.g. clicked
    // "Start Now" on pricing). Match the signup order: onboarding FIRST, then
    // pay. If they haven't onboarded yet, carry the plan and send them to
    // onboarding (checkout fires at "Finish setup"). If they've already
    // onboarded, there's nothing left to set up -> go straight to checkout.
    if (isPaidPlan) {
      resolvePostAuthDestination(API_BASE, userId).then((dest) => {
        if (cancelled) return;
        if (dest === "/dashboard") {
          startCheckoutForPlan(selectedPlan, "/dashboard").then((redirected) => {
            if (!redirected && !cancelled) navigate(dest, { replace: true });
          });
        } else {
          localStorage.setItem("wc_pending_plan", selectedPlan);
          navigate(dest, { replace: true });
        }
      });
      return () => { cancelled = true; };
    }
    resolvePostAuthDestination(API_BASE, userId)
      .then((dest) => { if (!cancelled) navigate(dest, { replace: true }); })
      .catch((err) => {
        if (cancelled) return;
        console.error("onboarding lookup failed:", err);
        toast.error("Couldn't verify your account status. Please try again.");
      });
    return () => { cancelled = true; };
  }, [navigate, roleName, API_BASE]);

  const handleGoogleLogin = async (credentialResponse: { credential?: string }) => {
    try {
      const res = await fetch(`${API_BASE}/auth/google-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id_token: credentialResponse.credential,
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
  const handleAuthSuccess = async (data: { user_id: string | number; [key: string]: unknown }) => {
    clearStoredAuthState();

    storeAuthSession(data);
    toast.success("Account created successfully!");

    // Paid plan selected on pricing: ONBOARD FIRST, then pay. Carry the plan so
    // the end of onboarding ("Finish setup") sends them to Stripe checkout for
    // it. (A free signup carries nothing and just goes to onboarding.)
    if (isPaidPlan) {
      localStorage.setItem("wc_pending_plan", selectedPlan);
    }

    try {
      const dest = await resolvePostAuthDestination(API_BASE, data.user_id);
      navigate(dest);
    } catch (err) {
      console.error("onboarding lookup failed:", err);
      toast.error("Couldn't verify your account status. Please try logging in again.");
    }
  };

  const applyPromo = async () => {
    const code = promo.trim();
    if (!code) return;
    setPromoStatus("checking");
    try {
      const res = await fetch(`${API_BASE}/billing/validate-promo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data?.valid) {
        setPromoStatus("valid");
        setPromoDesc(data.description || "Discount applies at checkout");
        localStorage.setItem("wc_promo_code", data.code || code);
      } else {
        setPromoStatus("invalid");
        setPromoDesc("");
        localStorage.removeItem("wc_promo_code");
      }
    } catch {
      setPromoStatus("invalid");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (TURNSTILE_ENABLED && !captchaToken) {
      toast.error("Please complete the captcha.");
      return;
    }
    if (!termsAccepted) {
      toast.error("Please agree to the Terms and Privacy Policy.");
      return;
    }
    setLoading(true);

    try {
      let detectedTimezone = "";
      try {
        detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      } catch {
        detectedTimezone = "";
      }

      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          email,
          password,
          timezone: detectedTimezone,
          turnstileToken: captchaToken,
          terms_accepted: termsAccepted,
          // Bump this when the legal text changes - the server records it on
          // the user row for future re-acceptance prompts.
          terms_version: "2026-05",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Signup failed");
        resetCaptcha();
        return;
      }

      if (data.user_id) {
        clearStoredAuthState();
        localStorage.setItem("email", data.email || email);
        handleAuthSuccess(data);
        track("sign_up_completed", { method: "email" });
        return;
      }

      toast.error("Signup completed without a session. Please log in.");
      navigate("/login");
    } catch {
      toast.error("Server error. Please try again.");
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-[#F6F7F9]">
      <Toaster position="top-right" />

      {/* LEFT - SIGNUP FORM */}
      <div className="flex items-center justify-center px-6">
        <div className="w-full max-w-md bg-white rounded-xl shadow-xs p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">
              Create your account
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Get started with WarmChats
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-600">Full name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-gray-400 outline-hidden"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Email</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-gray-400 outline-hidden"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Password</label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-gray-400 outline-hidden"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">
                Promo code <span className="text-gray-400">(optional)</span>
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  value={promo}
                  onChange={(e) => {
                    setPromo(e.target.value);
                    if (promoStatus !== "idle") setPromoStatus("idle");
                  }}
                  placeholder=""
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-gray-400 outline-hidden"
                />
                <button
                  type="button"
                  onClick={applyPromo}
                  disabled={!promo.trim() || promoStatus === "checking"}
                  className="rounded-md border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  {promoStatus === "checking" ? "Checking…" : "Apply"}
                </button>
              </div>
              {promoStatus === "valid" && (
                <p className="mt-1 text-xs font-medium text-green-600">✓ {promoDesc} — applies at checkout</p>
              )}
              {promoStatus === "invalid" && (
                <p className="mt-1 text-xs font-medium text-red-500">That code isn&apos;t valid</p>
              )}
            </div>

            <Turnstile
              key={captchaKey}
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken("")}
              onError={() => setCaptchaToken("")}
            />

            <label className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-orange-500 focus:ring-orange-300"
              />
              <span>
                I agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-orange-600 hover:underline">Terms of Service</a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-orange-600 hover:underline">Privacy Policy</a>.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || (TURNSTILE_ENABLED && !captchaToken) || !termsAccepted}
              className="w-full py-2.5 rounded-md bg-orange-500 text-white font-medium hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 mt-5">
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="text-gray-900 font-medium hover:underline"
            >
              Login
            </button>
          </p>
          <p className="text-center text-sm text-gray-600 mt-2">
            Want to join the waitlist instead?{" "}
            <button
              onClick={() => navigate("/waitlist")}
              className="text-gray-900 font-medium hover:underline"
            >
              Join the waitlist
            </button>
          </p>
             <div className="my-6 text-center">
                        <GoogleLogin onSuccess={handleGoogleLogin} />
              </div>

      
        </div>
      </div>

      {/* RIGHT - INFO PANEL */}
      <div className="hidden md:flex items-center justify-center bg-[#F1F3F5]">
        <div className="bg-white rounded-xl shadow-xs p-20 max-w-md text-center">
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

export default Signup;
