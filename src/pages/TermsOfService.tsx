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
        <p className="text-sm text-gray-500 mb-8">Last Updated: February 23, 2026</p>

        <section className="space-y-6 text-gray-700 text-sm leading-6">
          <p>
            WarmChats is a software platform operated by Joseph Velasquez, a sole proprietor. These Terms apply to
            messaging and communications sent by agents and businesses using the WarmChats platform.
          </p>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using WarmChats ("WarmChats," "we," "our," or "us"), including our website, application,
              and related services (collectively, the "Service"), you agree to be bound by these Terms of Service
              ("Terms"). If you do not agree to these Terms, you may not access or use the Service.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Description of Service</h2>
            <p>
              WarmChats is a Software-as-a-Service (SaaS) platform that provides AI-powered communication automation tools
              for businesses and licensed professionals.
            </p>
            <p className="mt-2">The Service enables users to:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Send one-to-one SMS messages</li>
              <li>Send email communications</li>
              <li>Automate follow-ups</li>
              <li>Manage inbound and outbound conversations</li>
            </ul>
            <p className="mt-2">
              WarmChats acts solely as a technology platform and intermediary. SMS messages are transmitted through
              third-party telecommunications providers including Telnyx and other carriers.
            </p>
            <p className="mt-2">WarmChats does not:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Send messages on its own behalf</li>
              <li>Provide lead lists</li>
              <li>Engage in unsolicited outreach</li>
              <li>Guarantee delivery, response rates, or business outcomes</li>
            </ul>
            <p className="mt-2">Each user sends communications independently under their own brand and campaign registration.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Eligibility</h2>
            <p>You must be at least 18 years old and legally capable of forming a binding contract.</p>
            <p className="mt-2">By using the Service you represent that:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>You are legally authorized to operate your business</li>
              <li>You have authority to bind yourself or your organization</li>
              <li>You will comply with all telecommunications and marketing laws</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Account Registration & Responsibilities</h2>
            <p>To use SMS functionality, users must:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Complete brand and campaign registration where required (including A2P 10DLC)</li>
              <li>Provide accurate business information</li>
              <li>Maintain valid compliance and contact information</li>
            </ul>
            <p className="mt-2">You are responsible for:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>All activity under your account</li>
              <li>All messages sent from your assigned phone number</li>
              <li>Maintaining compliance with telecommunications regulations</li>
            </ul>
            <p className="mt-2">
              WarmChats reserves the right to suspend accounts that fail to meet compliance requirements.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Messaging Compliance & User Obligations</h2>
            <p>You acknowledge and agree that you are solely responsible for:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Obtaining express consent before sending SMS messages</li>
              <li>Maintaining records of opt-in consent</li>
              <li>Providing opt-out instructions in messages</li>
              <li>Honoring STOP requests immediately</li>
              <li>Responding to HELP requests where required</li>
              <li>Complying with all applicable laws and standards including:</li>
              <li>Telephone Consumer Protection Act (TCPA)</li>
              <li>CAN-SPAM Act</li>
              <li>CTIA Messaging Principles</li>
              <li>A2P 10DLC registration requirements</li>
              <li>Carrier and telecommunications provider policies</li>
            </ul>
            <p className="mt-2">
              Message frequency may vary depending on user interaction and communication activity. Message and data
              rates may apply.
            </p>
            <p className="mt-2 font-semibold text-gray-900">SMS Requirements</p>
            <p>All SMS messages must:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Be sent only to recipients who have provided express consent</li>
              <li>Clearly identify the sender</li>
              <li>
                Include opt-out language such as: "Reply STOP to unsubscribe. Reply HELP for assistance."
              </li>
            </ul>
            <p className="mt-2">
              Failure to comply may result in account suspension or termination. WarmChats may monitor messaging patterns
              to detect abuse, spam behavior, or non-compliant activity.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Prohibited Uses</h2>
            <p>You may not use WarmChats to:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Send unsolicited or spam messages</li>
              <li>Use purchased or scraped lead lists</li>
              <li>Engage in deceptive marketing practices</li>
              <li>Circumvent carrier filtering systems</li>
              <li>Harass or threaten individuals</li>
              <li>Violate telecommunications regulations</li>
            </ul>
            <p className="mt-2">
              Violations may result in account termination and possible reporting to telecommunications providers.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Payments & Subscription Terms</h2>
            <p>Paid plans are billed in advance on a recurring basis.</p>
            <p className="mt-2">By subscribing you agree that:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Fees are billed according to your selected plan</li>
              <li>Fees are generally non-refundable unless required by law</li>
              <li>Failure to pay may result in service suspension</li>
              <li>Messaging credits are not transferable</li>
            </ul>
            <p className="mt-2">Carrier messaging fees may apply depending on usage.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Third-Party Providers</h2>
            <p>WarmChats integrates with telecommunications providers including Telnyx and other carriers.</p>
            <p className="mt-2">We are not responsible for:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Carrier filtering</li>
              <li>Message delivery failures</li>
              <li>Telecom outages</li>
              <li>Campaign registration rejections</li>
              <li>Changes to carrier policies</li>
            </ul>
            <p className="mt-2">
              Users must comply with the policies of all third-party providers used by the platform.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Intellectual Property</h2>
            <p>All software, platform features, branding, and content associated with WarmChats are owned by WarmChats.</p>
            <p className="mt-2">You may not:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Reverse engineer</li>
              <li>Resell or white-label without written permission</li>
              <li>Use branding without authorization</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">10. Suspension & Termination</h2>
            <p>
              We may suspend or terminate accounts that:
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Violate messaging compliance rules</li>
              <li>Generate excessive spam complaints</li>
              <li>Trigger carrier filtering or blocking</li>
              <li>Fail campaign registration requirements</li>
              <li>Create regulatory or reputational risk</li>
            </ul>
            <p className="mt-2">Termination may occur without prior notice if necessary.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">11. Disclaimer of Warranties</h2>
            <p>WarmChats is provided "as is" and "as available."</p>
            <p className="mt-2">We make no guarantees regarding:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Message delivery</li>
              <li>Carrier approval</li>
              <li>Conversion rates</li>
              <li>Business outcomes</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">12. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, WarmChats shall not be liable for indirect or consequential damages.
            </p>
            <p className="mt-2">
              Total liability shall not exceed the amount paid by you to WarmChats in the prior twelve (12) months.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">13. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless WarmChats and its owner from claims or liabilities arising from:
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Your messaging practices</li>
              <li>Failure to obtain proper consent</li>
              <li>Violations of telecommunications laws</li>
              <li>Carrier enforcement actions</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">14. Changes to Terms</h2>
            <p>We may update these Terms at any time. Continued use constitutes acceptance.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">15. Governing Law</h2>
            <p>These Terms are governed by the laws of the State of California, United States.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">16. Contact Information</h2>
            <p>WarmChats</p>
            <p className="mt-1">Operated by Joseph Velasquez</p>
            <p className="mt-1">Email: support@warmchats.com</p>
            <p className="mt-1">Website: https://www.warmchats.com</p>
            <p className="mt-4 font-semibold text-gray-900">Agent Privacy Policy</p>
            <p className="mt-1">https://www.warmchats.com/agents/joseph</p>
            <p className="mt-4 font-semibold text-gray-900">WarmChats Platform Privacy Policy</p>
            <p className="mt-1">https://www.warmchats.com/privacy</p>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
};

export default TermsOfService;
