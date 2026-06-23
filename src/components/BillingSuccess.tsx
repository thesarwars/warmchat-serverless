// BillingSuccess.tsx
import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CreditCard } from "lucide-react";

const BillingSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const comped = searchParams.get("comped");
  const navigate = useNavigate();
  const API_BASE = import.meta.env.VITE_API_BASE;
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("user_id");
  const [status, setStatus] = useState("Verifying your payment...");

  useEffect(() => {
    // 100%-off promo: the comp plan was already activated in D1 with NO Stripe
    // payment, so there's nothing to verify. Confirm + route the user onward.
    if (comped) {
      const plan = searchParams.get("plan") || "";
      if (plan) localStorage.setItem("selectedPlan", plan);
      localStorage.removeItem("wc_promo_code");
      setStatus("Promo applied - you're all set! Redirecting...");
      const ret = searchParams.get("return");
      const dest = ret && ret.startsWith("/") ? ret : "/dashboard";
      setTimeout(() => navigate(dest), 1200);
      return;
    }
    if (!sessionId || !userId || !token) {
      setStatus("Invalid payment session.");
      return;
    }
    const verifyPayment = async () => {
      try {
        const res = await fetch(`${API_BASE}/billing/confirm-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sessionId }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          setStatus(data.message || "Payment verification failed.");
          return;
        }

        if (data.plan) {
          localStorage.setItem("selectedPlan", data.plan);
        }

        setStatus("Upgrade successful! Redirecting...");

        // Routing intent now travels in the success_url ?return= query param
        // (server-set in create-checkout-session), so it works cross-device
        // and survives logout. Fall back to /upgrade for the no-param case.
        const returnPath = searchParams.get("return");
        const dest = returnPath && returnPath.startsWith("/")
          ? returnPath
          : `/upgrade?plan=${data.plan}`;
        setTimeout(() => navigate(dest), 1200);
      } catch (err) {
        console.error(err);
        setStatus("Error verifying payment.");
      }
    };
    verifyPayment();
  }, [sessionId, comped, userId, token, API_BASE, navigate, searchParams]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-purple-50 via-white to-orange-50 p-6">
      <div className="bg-white rounded-xl shadow-xl p-8 max-w-md text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <CreditCard className="w-6 h-6 text-purple-600" />
          <h1 className="text-xl font-semibold">Billing Update</h1>
        </div>
        <p className="text-gray-700">{status}</p>
      </div>
    </div>
  );
};

export default BillingSuccess;
