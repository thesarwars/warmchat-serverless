import React, { useEffect, useState } from "react";
import Footer from "@/components/V2/Footer";
import Navbar from "../components/V2/Navbar";

const PrivacyPolicy: React.FC = () => {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">WarmChats Privacy Notice Addendum</h1>
        <p className="text-sm text-gray-500 mb-8">Last Updated: May 2026</p>

        <section className="space-y-6 text-gray-700 text-sm leading-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Introduction</h2>
            <p>
              WarmChats LLC provides communication, automation, AI workflow, CRM, and messaging software that enables
              businesses to manage conversations with contacts they independently collect and maintain.
            </p>
            <p className="mt-2">
              WarmChats acts solely as a technology platform provider. We do not independently generate leads, initiate
              communications with consumers, or send marketing messages on behalf of Customers.
            </p>
            <p className="mt-2">
              This Privacy Policy explains how we collect, use, disclose, and safeguard information when you access or
              use the WarmChats website, applications, software, and related services (collectively, the &ldquo;Services&rdquo;).
            </p>
            <p className="mt-2">By using the Services, you agree to this Privacy Policy.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Definitions</h2>
            <p><strong>&ldquo;Customer&rdquo;</strong> means any business or individual using the Services.</p>
            <p className="mt-2"><strong>&ldquo;End Customer&rdquo;</strong> means a contact, lead, client, or individual whose information is uploaded, managed, or communicated with through the Services by a Customer.</p>
            <p className="mt-2"><strong>&ldquo;Customer Data&rdquo;</strong> means information uploaded, stored, transmitted, or processed by Customers through the Services.</p>
            <p className="mt-2"><strong>&ldquo;End Customer Data&rdquo;</strong> means information related to End Customers, including contact details, CRM records, communications, lead data, and conversation history.</p>
            <p className="mt-2"><strong>&ldquo;Services&rdquo;</strong> means the WarmChats platform, applications, APIs, messaging tools, AI features, automations, and related software or services.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Information We Collect</h2>
            <p>We may collect:</p>

            <h3 className="font-semibold text-gray-900 mt-4 mb-1">Account &amp; Billing Information</h3>
            <ul className="list-disc ml-5 space-y-1">
              <li>Name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Business information</li>
              <li>Billing and subscription details</li>
              <li>Payment information processed through third-party providers</li>
            </ul>

            <h3 className="font-semibold text-gray-900 mt-4 mb-1">Customer &amp; End Customer Data</h3>
            <ul className="list-disc ml-5 space-y-1">
              <li>Names</li>
              <li>Email addresses</li>
              <li>Phone numbers</li>
              <li>Conversation history</li>
              <li>CRM notes</li>
              <li>Lead source information</li>
              <li>Appointment details</li>
              <li>Consent and opt-in records</li>
              <li>Messages, emails, calls, and automation activity</li>
            </ul>

            <h3 className="font-semibold text-gray-900 mt-4 mb-1">Messaging Registration Information</h3>
            <p>To support SMS and carrier registration requirements, we may collect:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Legal business name</li>
              <li>EIN or registration details</li>
              <li>Website URL</li>
              <li>Privacy Policy URL</li>
              <li>Sample messages</li>
              <li>Opt-in language</li>
              <li>Campaign descriptions</li>
            </ul>
            <p className="mt-2">
              This information may be submitted to third-party providers such as Telnyx for messaging registration and
              compliance purposes.
            </p>

            <h3 className="font-semibold text-gray-900 mt-4 mb-1">Usage &amp; Technical Information</h3>
            <ul className="list-disc ml-5 space-y-1">
              <li>IP address</li>
              <li>Browser and device information</li>
              <li>Session activity</li>
              <li>Platform usage data</li>
              <li>Cookies and tracking technologies</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. How We Use Information</h2>
            <p>We use information to:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Provide and maintain the Services</li>
              <li>Enable CRM, messaging, AI, automation, and communication features</li>
              <li>Process billing and subscriptions</li>
              <li>Facilitate SMS, email, and calling functionality</li>
              <li>Improve platform performance and security</li>
              <li>Detect abuse, spam, fraud, or suspicious activity</li>
              <li>Enforce our Terms and compliance policies</li>
              <li>Comply with legal and carrier requirements</li>
            </ul>
            <p className="mt-2">WarmChats does not independently market to End Customers or generate leads on behalf of Customers.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. AI Features &amp; Automations</h2>
            <p>WarmChats may provide AI-powered messaging, automations, summaries, lead qualification, and workflow tools.</p>
            <p className="mt-2">Customers are solely responsible for:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Reviewing AI-generated content</li>
              <li>Monitoring automations</li>
              <li>Ensuring communications comply with applicable laws</li>
              <li>Verifying message accuracy and appropriateness</li>
            </ul>
            <p className="mt-2">WarmChats does not guarantee the accuracy or legality of AI-generated communications.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Messaging Compliance &amp; Customer Responsibility</h2>
            <p>WarmChats provides communication infrastructure and software functionality only.</p>
            <p className="mt-2">Customers are solely responsible for:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Obtaining proper consent before sending communications</li>
              <li>Maintaining accurate opt-in records</li>
              <li>Complying with TCPA, CAN-SPAM, carrier rules, and applicable laws</li>
              <li>Honoring STOP and unsubscribe requests</li>
              <li>Ensuring messaging content matches registered use cases</li>
            </ul>
            <p className="mt-2">Customers may not use:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Purchased lists</li>
              <li>Scraped data</li>
              <li>Unauthorized third-party contact databases</li>
            </ul>
            <p className="mt-2">
              WarmChats does not independently verify whether End Customers have opted in to receive communications from
              Customers.
            </p>
            <p className="mt-2">
              WarmChats reserves the right to suspend or terminate accounts that violate messaging rules, create excessive
              complaints, or create compliance risk.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. How We Share Information</h2>
            <p>We may share information with:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Hosting, infrastructure, analytics, and payment providers</li>
              <li>Messaging and communication providers necessary to deliver Services</li>
              <li>Third-party integrations authorized by Customers</li>
              <li>Legal or regulatory authorities when required by law</li>
              <li>Successors or affiliates in connection with mergers, acquisitions, or business transfers</li>
            </ul>
            <p className="mt-2">WarmChats does not sell Customer Data or End Customer Data.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Billing, Usage Limits &amp; Overage Charges</h2>
            <p>Subscription plans may include limits for:</p>
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
            <p className="mt-2">Customers are responsible for monitoring usage and associated charges.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Security &amp; Data Retention</h2>
            <p>We implement reasonable administrative, technical, and physical safeguards designed to protect information.</p>
            <p className="mt-2">No system is completely secure, and we cannot guarantee absolute security.</p>
            <p className="mt-2">
              WarmChats may retain account, billing, messaging, compliance, and operational records as reasonably
              necessary to provide Services, maintain security, comply with legal obligations, and enforce agreements.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">10. Your Privacy Rights</h2>
            <p>Depending on applicable law, Customers may have rights to:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Access personal information</li>
              <li>Correct inaccurate information</li>
              <li>Request deletion</li>
              <li>Request portability of data</li>
            </ul>
            <p className="mt-2">Privacy requests may be submitted to: support@warmchats.com</p>
            <p className="mt-2">End Customers should contact the business that originally collected their information.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">11. Third-Party Services</h2>
            <p>
              WarmChats may integrate with third-party platforms, messaging providers, CRM systems, analytics providers,
              and communication services.
            </p>
            <p className="mt-2">Use of third-party services is governed by their own terms and privacy policies.</p>
            <p className="mt-2">WarmChats is not responsible for third-party data practices.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">12. No Legal Advice</h2>
            <p>WarmChats does not provide legal advice.</p>
            <p className="mt-2">
              Any compliance-related information or guidance provided through the Services is for informational purposes
              only and should not be relied upon as legal advice.
            </p>
            <p className="mt-2">
              Customers are solely responsible for consulting their own legal counsel regarding compliance obligations.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">13. Changes to This Addendum</h2>
            <p>We may update this Addendum periodically.</p>
            <p className="mt-2">Continued use of the Services after updates constitutes acceptance of the revised Addendum.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">14. Contact Information</h2>
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

export default PrivacyPolicy;
