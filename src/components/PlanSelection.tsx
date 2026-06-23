import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import clsx from "clsx";
import { storeAuthSession } from "../utils/authSession";

const API_BASE = import.meta.env.VITE_API_BASE;

type Plan = {
  id: string;
  name: string;
  price: number;
  limits?: Record<string, number | string | null>;
  features?: string[];
  costs?: string[];
};

const PLANS: Plan[] = [
  {
    id: "free_channel",
    name: "Free",
    price: 0,
    features: [
      "1 seat",
      "Centralized lead inbox",
      "Email outreach only",
      "500 emails / month",
      "AI email writer (limited credits)",
      "1 basic follow-up sequence (3 steps)",
      "Auto-response (email only, basic rules)",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 89,
    features: [
      "1 seat",
      "1,250 SMS / month",
      "10,000 emails / month",
      "2,500 AI messages",
      "1000 calling minutes",
      "AI instant reply",
      "Lead inbox",
      "Templates",
    ],
    costs: [
      "Extra SMS: $0.015",
      "Extra Emails: $0.002",
      "Extra AI Messages: $0.002",
      "Extra Calling Minutes: $0.015",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 149,
    features: [
      "1 seat",
      "2,500 SMS / month",
      "20,000 emails / month",
      "15,000 AI messages",
      "3750 calling minutes",
      "AI follow-up sequences",
      "Automation",
      "Appointment alerts",
      "Advanced templates",
    ],
    costs: [
      "Extra SMS: $0.015",
      "Extra Emails: $0.002",
      "Extra AI Messages: $0.002",
      "Extra Calling Minutes: $0.015",
    ],
  },
];

interface PlanSelectionProps {
  userId: string;
  token: string;
  currentPlan?: string;
  onStepComplete: (plan: string) => void;
}

const PlanSelection: React.FC<PlanSelectionProps> = ({
  userId,
  token,
  currentPlan,
  onStepComplete,
}) => {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<string>(() => currentPlan || "free_channel");
  const [paymentDone, setPaymentDone] = useState<boolean>(false);
 useEffect(() => {
    const fetchBillingStatus = async () => {
      if (!token) return;

      try {
        const res = await fetch(`${API_BASE}/billing/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        // Payment is considered done if a card exists or plan is free
        if (data.is_active) {
          setPaymentDone(true);
        } else {
          setPaymentDone(false);
        }

        // Store selected plan locally
       
      } catch (err) {
        console.error("Failed to fetch billing status", err);
      }
    };

    fetchBillingStatus();
  }, [token]);
  useEffect(() => {
    const fetchSelectedPlan = async () => {
      try {
        const res = await fetch(`${API_BASE}/onboarding/${userId}/plan`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.plan) setSelectedPlan(data.plan);
      } catch (err) {
        console.error(err);
      }
    };
    fetchSelectedPlan();

    const storedPlan = localStorage.getItem("selectedPlan");
    if (storedPlan) setSelectedPlan(storedPlan);
  }, [userId, token]);

  const handleContinue = async (planId: string) => {
    setSelectedPlan(planId);
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) return;

    try {
      if (plan.price === 0) {
        const res = await fetch(`${API_BASE}/onboarding/${userId}/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ plan: plan.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Failed to save plan.");
        }
        if (data.user_id) {
          storeAuthSession({ ...data, role_id: "2", role_name: "Owner" });
        }
        localStorage.setItem("selectedPlan", plan.id);
        onStepComplete(plan.id);
        return;
      }

      // localStorage.setItem("selectedPlan", plan.id);
      const res = await fetch(`${API_BASE}/billing/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          planId: plan.id,
          cancelPath: window.location.pathname,
          promoCode: localStorage.getItem("wc_promo_code") || "",
        }),
      });
      const data = await res.json();
      if (data.checkout_url) window.location.assign(data.checkout_url);
      else if (data.comped) {
        // 100%-off promo: comped instantly in D1, no Stripe. Advance onboarding
        // just like the free path - the paid plan is already active.
        localStorage.setItem("selectedPlan", plan.id);
        localStorage.removeItem("wc_promo_code");
        onStepComplete(plan.id);
      }
      else alert("Failed to initiate checkout.");
    } catch (err) {
      console.error(err);
      alert("Failed to save plan.");
    }
  };
  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <button
        type="button"
        onClick={() => navigate("/dashboard")}
        className="absolute top-6 right-6 rounded-full border border-gray-200 bg-white p-2 text-gray-500 shadow-xs transition hover:bg-gray-100"
        aria-label="Close pricing"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold text-gray-800">Choose Your Plan</h2>
        <p className="text-lg text-gray-500 mt-2">Simple pricing. Upgrade anytime.</p>
      </div>

    {/* Full-screen responsive plan container */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-350">
      {PLANS.map((plan) => {
        const selected = selectedPlan === plan.id;
        const isCurrent = currentPlan === plan.id;

        return (
          <div
            key={plan.id}
            className={clsx(
              "flex flex-col justify-between border rounded-3xl bg-white p-8 shadow-sm hover:shadow-xl transition-all",
              selected ? "border-orange-500 scale-105" : "border-gray-200"
            )}
          >
            <div className="flex flex-col items-center mb-6">
              <div className="text-2xl font-semibold">{plan.name}</div>
              {isCurrent && (
                <span className="mt-2 text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
                  Current Plan
                </span>
              )}
              <div className="text-4xl font-bold mt-4">
                {plan.price === 0 ? "Free" : `$${plan.price}`}
                {plan.price > 0 && <span className="text-sm text-gray-500">/mo</span>}
              </div>
            </div>

            <ul className="flex-1 space-y-2 mb-6">
              {(plan.features || []).map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-gray-700 text-sm">
                  <Check className="text-green-500 w-4 h-4 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {plan.costs && plan.costs.length > 0 ? (
              <div className="mt-2 rounded-xl border border-orange-100 bg-orange-50/60 p-3 text-xs text-gray-700">
                <p className="font-semibold text-gray-800 mb-1">Estimated carrier costs (pass-through)</p>
                <ul className="space-y-1">
                  {plan.costs.map((cost, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-orange-500">-</span>
                      <span>{cost}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button
              disabled={selected  && !paymentDone}
              onClick={() => handleContinue(plan.id)}
              className={clsx(
                "w-full py-3 mt-auto rounded-xl font-semibold text-lg text-white",
                selected
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-orange-500 hover:bg-orange-600"
              )}
            >
              {selected ? "Selected" : "Select Plan"}
            </button>
          </div>
        );
      })}
    </div>
    {/* {!paymentDone && (
    <div className="mt-6 text-center text-sm text-red-500">
      To select a paid plan, please add a payment method first.
    </div>
    )} */}
    </div>
  );
};
export default PlanSelection;
