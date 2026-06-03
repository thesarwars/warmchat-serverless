import React, { useEffect, useState } from "react";
import Navbar from "../components/V2/Navbar";
import Footer from "@/components/V2/Footer";

const OptInForm: React.FC = () => {
  const API_BASE = import.meta.env.VITE_API_BASE;
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsStarted(true), 100);
    return () => clearTimeout(timer);
  }, []);
  const params = new URLSearchParams(window.location.search);
  const initialName = params.get("name") || "";
  const agentSlug = params.get("slug") || "";
  const [agentName, setAgentName] = useState(initialName);

  const privacyUrl = agentSlug ? `/agents/${agentSlug}/privacy` : "/privacy";
  const termsUrl = agentSlug ? `/agents/${agentSlug}/terms` : "/terms";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const fetchAgent = async () => {
      if (!agentSlug || agentName) return;
      try {
        const res = await fetch(`${API_BASE}/public/agents/${agentSlug}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Agent not found");
        setAgentName(data.business_name || data.agent_name || "");
      } catch {
        setAgentName("");
      }
    };

    fetchAgent();
  }, [API_BASE, agentName, agentSlug]);

  const resolvedName = agentName || "this business";

  return (
    <div className="min-h-screen bg-white">
      <Navbar isVisible={isStarted} />
      <div className="max-w-3xl mx-auto px-6 pt-35 lg:pt-50 pb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          SMS consent form used by {resolvedName}
        </h1>

        <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-900">Name</label>
            <input
              type="text"
              placeholder="Jane Doe"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs focus:border-warmchats-primary focus:outline-hidden focus:ring-2 focus:ring-warmchats-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-900">Phone</label>
            <input
              type="tel"
              required
              placeholder="(555) 123-4567"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs focus:border-warmchats-primary focus:outline-hidden focus:ring-2 focus:ring-warmchats-primary/30"
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-gray-700 leading-5">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300" />
            <span>
              I agree to receive SMS messages from {resolvedName} regarding real estate updates. Message
              frequency may vary. Message and data rates may apply. Reply STOP to opt out or HELP for
              assistance.{" "}
              <a href={termsUrl} className="text-purple-600 hover:underline font-semibold">
                View our Terms of Service
              </a>
              <span className="text-black"> and </span>
              <a href={privacyUrl} className="text-purple-600 hover:underline font-semibold">
                View our Privacy Policy
              </a>
              .
            </span>
          </label>
          <p className="text-xs text-gray-700 leading-5">
            Your mobile information will not be sold or shared with third parties for promotional or
            marketing purposes.
          </p>

          <button
            type="submit"
            className="w-full rounded-lg bg-warmchats-primary px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-warmchats-primary-dark transition-colors"
          >
            Submit
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
};

export default OptInForm;
