import React, { useEffect, useState } from "react";
import Footer from "@/components/V2/Footer";
import Navbar from "../components/V2/Navbar";

const TermsOfService: React.FC = () => {
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    const timer = setTimeout(() => setIsStarted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar isVisible={isStarted} />
      <div className="max-w-4xl mx-auto px-6 pt-35 lg:pt-50 pb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">WarmChats Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Effective Date: May 26, 2026</p>

        <section className="space-y-6 text-gray-700 text-sm leading-6">
          <div>
            <p>Welcome to WarmChats (&ldquo;WarmChats,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).</p>
            <p className="mt-2">
              These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the WarmChats platform,
              applications, messaging tools, AI features, automations, APIs, and related services (collectively, the
              &ldquo;Services&rdquo;).
            </p>
            <p className="mt-2">By using the Services, you agree to these Terms.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Services</h2>
            <p>WarmChats provides CRM, communication, AI automation, messaging, email, and calling software for businesses.</p>
            <p className="mt-2">
              WarmChats acts solely as a software and infrastructure provider. WarmChats does not generate leads, send
              communications independently, or act as the sender of Customer messages.
            </p>
            <p className="mt-2">Customers are solely responsible for all communications sent through the Services.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Customer Responsibilities</h2>
            <p>Customers are solely responsible for:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Obtaining proper consent before sending communications</li>
              <li>Maintaining accurate opt-in records</li>
              <li>Complying with TCPA, CAN-SPAM, carrier rules, and applicable laws</li>
              <li>All messages, calls, emails, and automations sent through the Services</li>
              <li>Reviewing AI-generated content and automations</li>
            </ul>
            <p className="mt-2">Customers may not:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Send spam or unauthorized communications</li>
              <li>Upload purchased, scraped, or unauthorized contact lists</li>
              <li>Use the Services for unlawful, deceptive, or abusive activity</li>
            </ul>
            <p className="mt-2">
              WarmChats reserves the right to suspend or terminate accounts that violate these Terms or create compliance
              risk.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Messaging &amp; AI Disclaimer</h2>
            <p>WarmChats may provide AI-generated messaging, automations, summaries, and workflow tools.</p>
            <p className="mt-2">Customers are solely responsible for reviewing and monitoring AI-generated content.</p>
            <p className="mt-2">WarmChats does not guarantee:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Message delivery</li>
              <li>Lead conversion</li>
              <li>Business results</li>
              <li>AI accuracy</li>
              <li>Regulatory compliance</li>
            </ul>
            <p className="mt-2">Message delivery may be delayed, filtered, or blocked by carriers or third-party providers.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Billing &amp; Overage Charges</h2>
            <p>Subscription plans may include usage limits for:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>SMS</li>
              <li>Email</li>
              <li>AI usage</li>
              <li>Calling minutes</li>
              <li>Automations</li>
            </ul>
            <p className="mt-2">
              Additional overage charges, carrier fees, taxes, and third-party communication costs may apply if usage
              exceeds included limits.
            </p>
            <p className="mt-2">All fees are non-refundable unless otherwise required by law.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Third-Party Services</h2>
            <p>WarmChats may integrate with third-party providers and communication services.</p>
            <p className="mt-2">
              WarmChats is not responsible for third-party outages, delivery failures, or external platform functionality.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Privacy</h2>
            <p>Use of the Services is subject to the WarmChats Privacy Policy and Privacy Notice Addendum.</p>
            <p className="mt-2">
              Customers are solely responsible for ensuring they have the legal right to upload and communicate with their
              contacts.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Limitation of Liability</h2>
            <p>The Services are provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo;</p>
            <p className="mt-2">
              To the maximum extent permitted by law, WarmChats shall not be liable for indirect, incidental,
              consequential, or special damages, including lost profits, lost data, regulatory fines, carrier penalties,
              or message delivery failures.
            </p>
            <p className="mt-2">
              WarmChats&rsquo; total liability shall not exceed the amount paid by the Customer to WarmChats during the
              three (3) months preceding the claim.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Indemnification</h2>
            <p>
              Customers agree to defend, indemnify, and hold harmless WarmChats from any claims, damages, liabilities,
              fines, or expenses arising from:
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Customer communications</li>
              <li>Failure to obtain proper consent</li>
              <li>Violations of messaging laws</li>
              <li>Uploaded contact data</li>
              <li>Customer misuse of the Services</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Changes to Terms</h2>
            <p>WarmChats may update these Terms at any time.</p>
            <p className="mt-2">Continued use of the Services constitutes acceptance of the updated Terms.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">10. Contact Information</h2>
            <p>WarmChats LLC</p>
            <p>Email: support@warmchats.com</p>
            <p>Website: warmchats.com</p>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
};

export default TermsOfService;
