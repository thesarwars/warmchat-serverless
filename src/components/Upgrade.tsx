import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Rocket } from "lucide-react";
import StripeWrapper from "./StripeWrapper";
import PlanSelection from "./PlanSelection";
import MainLayout from "./MainLayout";

const API_BASE = import.meta.env.VITE_API_BASE;

const Upgrade: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("user_id");

  const planFromUrl = searchParams.get("plan");
  const storedPlan = localStorage.getItem("selectedPlan");

  const selectedPlan = planFromUrl || storedPlan;

  const [cardAdded, setCardAdded] = useState<boolean>(false);
  const [currentPlan, setCurrentPlan] = useState<string | null>(selectedPlan);
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (!token) navigate("/login");
  }, [token, navigate]);

  useEffect(() => {
    const fetchBillingStatus = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/billing/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        if (data.plan) setCurrentPlan(data.plan);
        setCardAdded(data.card_added || false);

        if (data.card_added) setStep(2);

        if (data.plan) localStorage.setItem("selectedPlan", data.plan);
      } catch (err) {
        console.error("Failed to fetch billing status", err);
      }
    };

    fetchBillingStatus();
  }, [token]);

  const body = (
    <div className="min-h-screen w-full flex flex-col bg-linear-to-br from-purple-50 via-white to-orange-50">
        <div className="flex flex-col flex-1 items-center justify-start w-full p-6">
          <div className="flex items-center justify-between w-full max-w-4xl mb-8">
            <div className="flex items-center gap-3">
              <Rocket className="w-8 h-8 text-orange-500" />
              <h1 className="text-2xl font-bold">Upgrade Your Plan</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/dashboard")}
                className="text-sm font-semibold text-gray-600 hover:text-orange-600"
              >
                Back to dashboard
              </button>
              <button
                onClick={() => navigate(-1)}
                aria-label="Close upgrade"
                className="text-gray-500 hover:text-gray-700 text-xl leading-none"
              >
                x
              </button>
            </div>
          </div>

          {/* STEP 1 - Add Payment Method */}
          {step === 1 && !cardAdded && (
            <div className="w-full max-w-4xl">
              <StripeWrapper
                onSuccess={() => {
                  setCardAdded(true);
                  toast.success("Payment method added! You can now select a paid plan.");
                  setStep(2);
                }}
              />
            </div>
          )}

          {/* STEP 2 - Select Plan */}
          {step === 2 && (
            <div className="flex-1 w-full">
              <PlanSelection
                userId={userId!}
                token={token!}
                currentPlan={currentPlan || undefined}
                onStepComplete={(plan: string) => {
                  const isPaidPlan = plan !== "free_channel";

                  if (isPaidPlan && !cardAdded) {
                    toast.error("Please add a payment method before selecting a paid plan.");
                    setStep(1); // go back to step 1
                    return;
                  }

                  if (plan === currentPlan) {
                    toast("You are already on this plan");
                    return;
                  }

                  localStorage.setItem("selectedPlan", plan);
                  toast.success(`Upgrading to ${plan.toUpperCase()}...`);
                  setCurrentPlan(plan);
                }}
              />
            </div>
          )}
        </div>
    </div>
  );

  // Standalone page at /upgrade (used by onboarding/checkout; wraps its own
  // MainLayout). The `embedded` mode renders the bare body for hosts with chrome.
  return embedded ? body : <MainLayout>{body}</MainLayout>;
};

export default Upgrade;
