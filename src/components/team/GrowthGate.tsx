import { useNavigate } from "react-router-dom";
import { Lock, Sparkles, Loader2 } from "lucide-react";
import MainLayout from "../MainLayout";
import { usePlan } from "@/helpers/usePlan";

/**
 * Wrap any team-related page in this gate. Team management is reserved for the
 * Custom Brokerage plan - if the org is on any other plan (including Starter or
 * Growth), an upgrade prompt is shown instead of the page body.
 */
export default function GrowthGate({ children, featureName }: { children: React.ReactNode; featureName: string }) {
  const { isBroker, isLoading, plan } = usePlan();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500">
          <Loader2 size={18} className="animate-spin" /> Checking your plan...
        </div>
      </MainLayout>
    );
  }

  if (!isBroker) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-orange-100 to-purple-100">
              <Lock size={28} className="text-orange-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {featureName} is a Custom Brokerage feature
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Team management, Lead Routing, and Office tools are included with the Custom Brokerage plan.
              Talk to us to unlock multi-agent collaboration, brokerage-grade dashboards, and shared inbox features.
            </p>
            <p className="mt-3 text-xs uppercase tracking-wide text-gray-400">
              Current plan: <span className="font-semibold text-gray-600">{plan}</span>
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/upgrade")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-linear-to-r from-orange-500 to-purple-500 shadow-md hover:opacity-90 transition"
              >
                <Sparkles size={15} /> View plans
              </button>
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="inline-flex items-center px-5 py-3 rounded-xl text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return <>{children}</>;
}
