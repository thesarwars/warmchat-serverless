import React, { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Clock,
  LifeBuoy,
  LoaderCircle,
  Mail,
  Send,
} from "lucide-react";
import { baseURL as API_BASE } from "@/helpers/api";
import Turnstile from "@/components/Turnstile";
import { TURNSTILE_ENABLED } from "@/lib/turnstile";

const quickHelp = [
  "Connecting Gmail or business email",
  "Registering phone numbers and SMS campaigns",
  "Importing leads and consent records",
  "Creating AI follow-up templates",
  "Billing, plan, and usage questions",
  "Troubleshooting inbox or delivery issues",
];

const SupportContent: React.FC = () => {
  const [submittedAt] = useState(() => Date.now());
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    message: "",
    referral: "",
    companyWebsite: "",
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const resetCaptcha = () => {
    setCaptchaToken("");
    setCaptchaKey((k) => k + 1);
  };
  const isSubmitting = status === "submitting";
  const isSuccess = status === "success";

  const canSubmit = useMemo(
    () =>
      Boolean(
        form.firstName.trim() &&
          form.lastName.trim() &&
          form.email.trim() &&
          form.message.trim() &&
          !isSubmitting &&
          (!TURNSTILE_ENABLED || captchaToken),
      ),
    [form.email, form.firstName, form.lastName, form.message, isSubmitting, captchaToken],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const updateField =
    (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setStatus("submitting");
    setFeedback("");

    try {
      const response = await fetch(`${API_BASE}/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, submittedAt, turnstileToken: captchaToken }),
      });
      const data = (await response.json().catch((): null => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.message || "Unable to send your message.");
      }

      setStatus("success");
      setFeedback("Thanks. We received your request and will reply soon.");
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        message: "",
        referral: "",
        companyWebsite: "",
      });
      resetCaptcha();
    } catch (error) {
      setStatus("error");
      setFeedback(error instanceof Error ? error.message : "Unable to send your message.");
      resetCaptcha();
    }
  };

  return (
    <>
      <section className="mx-auto max-w-6xl pb-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#fff1ec] text-[#fe5536]">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <h1 className="text-4xl font-bold leading-tight text-gray-900 sm:text-5xl">
            How can we help?
          </h1>
          <p className="mt-5 text-lg leading-8 text-gray-500">
            Tell us what is going on in WarmChats and we will route it to the
            right person. Account setup, billing, inbox issues, SMS approvals,
            automations, and deliverability are all fair game.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 pb-16 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
        <aside className="space-y-7 lg:sticky lg:top-28">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Reach the team
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#667085]">
              Send the form or email us directly. Including the page,
              automation, lead, or inbox thread involved helps us move faster.
            </p>
          </div>

          <div className="space-y-4">
            <a
              href="mailto:support@warmchats.com"
              className="flex items-center gap-3 rounded-lg border border-orange-200 bg-white px-4 py-3 text-sm font-semibold text-orange-900 shadow-sm transition hover:border-orange-500"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50 text-orange-500">
                <Mail className="h-4 w-4" />
              </span>
              support@warmchats.com
            </a>
            <div className="flex items-center gap-3 rounded-lg border border-orange-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff1ec] text-[#fe5536]">
                <Clock className="h-4 w-4" />
              </span>
              Support is available 24/7 for any issues.
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-orange-500">
              Common requests
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {quickHelp.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </aside>

        <div className="rounded-xl border border-orange-200 bg-white p-5 shadow-[0_18px_60px_rgba(234,88,12,0.10)] sm:p-8 lg:p-10">
          <div className="flex flex-col gap-2 border-b border-orange-100 pb-6">
            <h2 className="text-2xl font-bold text-gray-900">Send a message</h2>
            <p className="text-sm leading-6 text-[#667085]">
              We will reply to the email address you provide.
            </p>
          </div>
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-orange-900">
                First name <span className="text-[#fe5536]">*</span>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={updateField("firstName")}
                  autoComplete="given-name"
                  required
                  className="mt-2 h-12 w-full rounded-lg border border-orange-200 bg-white px-4 text-base text-gray-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
                />
              </label>
              <label className="block text-sm font-semibold text-orange-900">
                Last name <span className="text-[#fe5536]">*</span>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={updateField("lastName")}
                  autoComplete="family-name"
                  required
                  className="mt-2 h-12 w-full rounded-lg border border-orange-200 bg-white px-4 text-base text-gray-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
                />
              </label>
            </div>

            <label className="block text-sm font-semibold text-orange-900">
              Work email address <span className="text-[#fe5536]">*</span>
              <input
                type="email"
                value={form.email}
                onChange={updateField("email")}
                autoComplete="email"
                required
                className="mt-2 h-12 w-full rounded-lg border border-orange-200 bg-white px-4 text-base text-gray-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
              />
            </label>

            <label className="hidden" aria-hidden="true">
              Company website
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.companyWebsite}
                onChange={updateField("companyWebsite")}
              />
            </label>

            <label className="block text-sm font-semibold text-orange-900">
              How can we help you? <span className="text-[#fe5536]">*</span>
              <textarea
                value={form.message}
                onChange={updateField("message")}
                required
                rows={6}
                maxLength={5000}
                className="mt-2 w-full resize-y rounded-lg border border-orange-200 bg-white px-4 py-3 text-base text-gray-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
              />
            </label>

            <label className="block text-sm font-semibold text-orange-900">
              How did you hear about us?
              <textarea
                value={form.referral}
                onChange={updateField("referral")}
                rows={4}
                maxLength={1000}
                className="mt-2 w-full resize-y rounded-lg border border-orange-200 bg-white px-4 py-3 text-base text-gray-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
              />
            </label>

            <p className="text-xs leading-5 text-[#667085]">
              WarmChats uses this information only to respond to your request.
              You can review our privacy practices in the Privacy Policy.
            </p>

            {feedback && (
              <div
                className={`rounded-lg px-4 py-3 text-sm ${
                  isSuccess
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
                role="status"
              >
                {feedback}
              </div>
            )}

            <Turnstile
              key={captchaKey}
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken("")}
              onError={() => setCaptchaToken("")}
            />

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-6 text-sm font-semibold text-white transition hover:bg-orange-600 hover:shadow-lg hover:shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isSubmitting ? "Sending..." : "Send"}
            </button>
          </form>
        </div>
      </section>
    </>
  );
};

export default SupportContent;
