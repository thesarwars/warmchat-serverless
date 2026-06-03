import React, { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import Navbar from "../components/V2/Navbar";
import Footer from "@/components/V2/Footer";

type AgentProfile = {
  slug: string;
  agent_name: string;
  business_type?: string | null;
  is_business?: boolean;
  business_name?: string | null;
  brokerage?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  privacy_url?: string | null;
  terms_url?: string | null;
  agent_page_url?: string | null;
  agent_privacy_url?: string | null;
  agent_terms_url?: string | null;
  last_updated?: string | null;
  business_address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  };
};

const AgentPublicPage: React.FC = () => {
  const { slug } = useParams();
  const location = useLocation();
  const API_BASE = import.meta.env.VITE_API_BASE;
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsStarted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchAgent = async () => {
      if (!slug) return;
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/public/agents/${slug}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Agent not found");
        setAgent(data);
      } catch (err) {
        setError((err as Error).message || "Agent not found");
      } finally {
        setLoading(false);
      }
    };

    fetchAgent();
  }, [API_BASE, slug]);

  const isPrivacyPage = location.pathname.includes("/privacy");
  const isBusiness = agent?.business_type === "registered_business" || Boolean(agent?.is_business);
  const displayName = agent?.business_name || agent?.agent_name || "Agent";
  const brokerage = !isBusiness ? agent?.brokerage || null : null;
  const address = agent?.business_address;
  const addressLine = [address?.line1, address?.line2].filter(Boolean).join(", ");
  const cityStateLine = [address?.city, address?.state].filter(Boolean).join("/");
  const fullCityStateLine = [address?.city, address?.state, address?.postal_code].filter(Boolean).join(", ");
  const pageTitle = isPrivacyPage ? `Privacy Policy - ${displayName}` : displayName;
  const pageSubtitle = isPrivacyPage ? "This policy page is personalized for this account." : null;

  const agentPrivacyUrl = agent?.agent_privacy_url || agent?.privacy_url || `/agents/${slug}/privacy`;
  const agentTermsUrl = agent?.agent_terms_url || agent?.terms_url || `/agents/${slug}/terms`;
  const agentWebsiteUrl = agent?.agent_page_url || agent?.website || `/agents/${slug}`;

  return (
    <div className="min-h-screen bg-white">
      <Navbar isVisible={isStarted} />
      <div className="max-w-4xl mx-auto px-6 pt-35 lg:pt-50 pb-10">
        {loading ? (
          <div className="text-gray-600 text-sm">Loading page...</div>
        ) : error ? (
          <div className="text-red-600 text-sm">{error}</div>
        ) : (
          <>
            <div className="border border-gray-200 rounded-2xl p-6 mb-8 bg-gray-50">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600 mb-3">
                {isPrivacyPage ? "Privacy Page" : "Website"}
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{pageTitle}</h1>
              {!isBusiness && <p className="text-sm text-gray-600 mt-1">Licensed Real Estate Agent</p>}
              {brokerage && <p className="text-sm text-gray-600 mt-0.5">{brokerage}</p>}
              {pageSubtitle && <p className="text-sm text-gray-500 mt-3">{pageSubtitle}</p>}

              <div className="mt-4 text-sm text-gray-700 space-y-1">
                {agent?.email && <p><span className="font-semibold">Email:</span> {agent.email}</p>}
                {agent?.phone && <p><span className="font-semibold">Phone:</span> {agent.phone}</p>}
                {addressLine && <p><span className="font-semibold">Address:</span> {addressLine}</p>}
                {cityStateLine && <p><span className="font-semibold">City/State:</span> {cityStateLine}</p>}
                <p>
                  <span className="font-semibold">Website:</span>{" "}
                  <a href={agentWebsiteUrl} target="_blank" rel="noreferrer" className="text-orange-600 hover:underline">
                    {agentWebsiteUrl}
                  </a>
                </p>
              </div>
            </div>

            <section className="space-y-8 text-gray-700 text-sm leading-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Messaging Description</h2>
                <p>
                  {displayName} sends conversational SMS messages related to real estate inquiries, property updates,
                  appointment scheduling, and follow-ups. Messages are sent to consumers who have opted in through
                  website contact forms, property inquiry forms, or open house registration forms.
                </p>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Opt-In</h2>
                <p>
                  Consumers opt in by submitting their information through website forms, open house sign-ins,
                  property inquiries, or direct communication.
                </p>
                <p className="mt-2">
                  By providing your phone number and submitting a form, you consent to receive SMS messages from {displayName}.
                </p>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">No Spam</h2>
                <p>
                  We only send messages to individuals who have provided prior consent. We do not send unsolicited messages.
                </p>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Compliance</h2>
                <ul className="space-y-1">
                  <li>Message frequency may vary depending on interaction.</li>
                  <li>Message &amp; data rates may apply.</li>
                  <li>Reply <span className="font-semibold">STOP</span> to opt out.</li>
                  <li>Reply <span className="font-semibold">HELP</span> for help.</li>
                </ul>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">SMS Communications</h2>
                <p>By providing your phone number, you consent to receive SMS messages from {displayName} regarding:</p>
                <ul className="mt-2 space-y-1">
                  <li>• Real estate inquiries</li>
                  <li>• Property listings</li>
                  <li>• Appointment confirmations</li>
                  <li>• Transaction updates</li>
                </ul>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Links</h2>
                <div className="flex flex-col gap-2">
                  <a href={agentPrivacyUrl} className="text-purple-600 hover:underline font-semibold">Privacy Policy</a>
                  <a href={agentTermsUrl} className="text-purple-600 hover:underline font-semibold">Terms of Service</a>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Contact Information</h2>
                <ul className="space-y-1">
                  <li className="font-semibold">{displayName}</li>
                  {brokerage && <li>{brokerage}</li>}
                  {agent?.email && <li>Email: {agent.email}</li>}
                  {agent?.phone && <li>Phone: {agent.phone}</li>}
                  {addressLine && <li>Address: {addressLine}</li>}
                  {fullCityStateLine && <li>{fullCityStateLine}</li>}
                </ul>
              </div>
            </section>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default AgentPublicPage;
