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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">WarmChats Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last Updated: May 2026</p>

        <section className="space-y-6 text-gray-700 text-sm leading-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Introduction</h2>
            <p>
              WarmChats LLC provides a software platform that enables businesses,
              including licensed real estate professionals and other service providers, to manage conversations,
              follow-ups, and communications with their own contacts.
            </p>
            <p className="mt-2">
              WarmChats acts solely as a technology platform provider. We do not initiate messages to consumers, generate
              leads independently, or send marketing communications on our own behalf.
            </p>
            <p className="mt-2">
              This Privacy Policy explains how we collect, use, disclose, and safeguard information when you access or
              use the WarmChats website, application, and related services (collectively, the "Services").
            </p>
            <p className="mt-2">By using WarmChats, you agree to the practices described in this Privacy Policy.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Information We Collect</h2>

            <h3 className="font-semibold text-gray-900 mb-1">a. Account &amp; Business Information</h3>
            <p>When you create an account, we may collect:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Business or company name</li>
              <li>Business address</li>
              <li>EIN or registration information (if submitted for messaging registration)</li>
              <li>Login credentials</li>
              <li>Billing and payment information (processed securely by third-party payment providers)</li>
            </ul>

            <h3 className="font-semibold text-gray-900 mt-4 mb-1">b. Customer &amp; Contact Data (User-Provided Content)</h3>
            <p>Customers may upload or input data about their own contacts ("End Customers"), including:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Names</li>
              <li>Email addresses</li>
              <li>Phone numbers</li>
              <li>Message content</li>
              <li>Interaction history</li>
              <li>Lead source information</li>
              <li>Consent status and opt-in records</li>
            </ul>
            <p className="mt-2">
              WarmChats does not collect this information independently. Customers are solely responsible for ensuring
              they have proper legal rights and consent to collect, upload, and communicate with their contacts.
            </p>

            <h3 className="font-semibold text-gray-900 mt-4 mb-1">c. Messaging Registration Information (10DLC &amp; Compliance)</h3>
            <p>When Customers apply for SMS messaging services through integrated providers (such as Telnyx), we may collect and store:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Legal business name</li>
              <li>EIN or sole proprietor registration details</li>
              <li>Website URL</li>
              <li>Privacy policy URL</li>
              <li>Opt-in language</li>
              <li>Sample message content</li>
              <li>Use case descriptions</li>
            </ul>
            <p className="mt-2">
              This information is submitted on behalf of the Customer for brand and campaign registration with carriers.
              Each Customer is registered individually as the messaging sender. WarmChats is not the registered brand or
              sender for Customer communications.
            </p>

            <h3 className="font-semibold text-gray-900 mt-4 mb-1">d. Usage Data</h3>
            <ul className="list-disc ml-5 space-y-1">
              <li>Features used</li>
              <li>Messages sent or scheduled</li>
              <li>Automation activity</li>
              <li>Session duration and timestamps</li>
              <li>Performance and analytics data</li>
            </ul>

            <h3 className="font-semibold text-gray-900 mt-4 mb-1">e. Technical &amp; Device Information</h3>
            <ul className="list-disc ml-5 space-y-1">
              <li>IP address</li>
              <li>Browser type</li>
              <li>Device type</li>
              <li>Operating system</li>
              <li>Log files</li>
              <li>Cookies and similar technologies</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. How We Use Information</h2>
            <p>We use information to:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Provide, operate, and maintain the Services</li>
              <li>Enable messaging, automation, and communication workflows</li>
              <li>Facilitate message delivery through third-party carriers and email providers</li>
              <li>Process subscriptions and payments</li>
              <li>Improve product performance and user experience</li>
              <li>Monitor compliance, detect abuse, and prevent fraud</li>
              <li>Enforce our Terms of Service</li>
              <li>Comply with legal and regulatory obligations</li>
            </ul>
            <p className="mt-2">WarmChats does not use End Customer data for independent marketing or advertising.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Data Sharing &amp; Disclosure</h2>
            <p>We do not sell personal information.</p>
            <p className="mt-2">We may share information with:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Service Providers: Hosting providers, analytics platforms, payment processors, messaging carriers, and other vendors necessary to operate the Services.</li>
              <li>Messaging &amp; Communication Providers: Information necessary to deliver SMS, email, or other communications sent by Customers.</li>
              <li>Legal Compliance: When required by law, subpoena, court order, or regulatory request.</li>
              <li>Business Transfers: In connection with a merger, acquisition, or asset sale.</li>
              <li>With Your Consent: When you direct or authorize us to do so.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Messaging &amp; SMS Responsibility</h2>
            <p>WarmChats provides messaging infrastructure only. Customers are solely responsible for:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Registering their own brand and campaign with carriers (including 10DLC registration where required)</li>
              <li>Obtaining proper opt-in consent from recipients</li>
              <li>Complying with TCPA, carrier rules, and all applicable messaging laws</li>
              <li>Ensuring message content matches their registered use case</li>
              <li>Honoring opt-out requests</li>
            </ul>
            <p className="mt-2">
              WarmChats enforces STOP and HELP keyword handling and requires Customers to attest that proper consent has
              been obtained. WarmChats is not the sender of Customer messages and does not control message recipients.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Data Security</h2>
            <p>
              We implement reasonable administrative, technical, and physical safeguards designed to protect
              information. However, no system is completely secure. Customers are responsible for maintaining the
              confidentiality of their login credentials.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Your Data Rights</h2>
            <p>Depending on your location, you may have rights to:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion</li>
              <li>Restrict certain processing</li>
              <li>Request data portability</li>
            </ul>
            <p className="mt-2">Requests may be submitted to: support@warmchats.com</p>
            <p className="mt-2">End Customers should direct privacy requests to the business that contacted them.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Cookies &amp; Tracking Technologies</h2>
            <p>WarmChats uses cookies to:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Maintain secure sessions</li>
              <li>Improve functionality</li>
              <li>Analyze performance and usage</li>
            </ul>
            <p className="mt-2">You may control cookies through your browser settings.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Children&apos;s Privacy</h2>
            <p>
              WarmChats is not intended for individuals under 18. We do not knowingly collect personal information from
              children under 18.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">10. Third-Party Integrations</h2>
            <p>
              WarmChats may integrate with third-party platforms and messaging providers. Your use of those services is
              governed by their respective policies. WarmChats is not responsible for third-party data practices.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy periodically. Continued use of the Services after updates constitutes
              acceptance of the revised policy.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">12. Contact Information</h2>
            <p>WarmChats LLC</p>
            <p>Email: support@warmchats.com</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">SMS Consent &amp; Opt-In Disclosure</h2>
            <h3 className="font-semibold text-gray-900 mb-1">SMS Messaging Compliance</h3>
            <p>WarmChats LLC provides messaging software that enables businesses to communicate with their own contacts.</p>
            <p className="mt-2">WarmChats does not generate leads or collect consumer phone numbers independently.</p>
            <p className="mt-2">Each Customer is responsible for:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Obtaining express consent before sending SMS messages</li>
              <li>Registering their brand and campaign where required by carriers</li>
              <li>Maintaining accurate opt-in records</li>
            </ul>
            <p className="mt-2">Message frequency varies by business. Message and data rates may apply.</p>
            <p className="mt-2">Recipients may reply STOP to opt out or HELP for assistance.</p>
            <p className="mt-2">
              WarmChats enforces opt-out handling but does not initiate communications independently.
            </p>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
