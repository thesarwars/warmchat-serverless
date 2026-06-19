"use client";

import { useState } from "react";

const CheckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path
      d="M8.5 2.5L3.75 7.5L1.5 5"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LockIcon = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
    <path
      d="M3 5.25V3.75C3 2.09315 4.34315 0.75 6 0.75C7.65685 0.75 9 2.09315 9 3.75V5.25M2.625 5.25H9.375C9.78921 5.25 10.125 5.58579 10.125 6V10.5C10.125 10.9142 9.78921 11.25 9.375 11.25H2.625C2.21079 11.25 1.875 10.9142 1.875 10.5V6C1.875 5.58579 2.21079 5.25 2.625 5.25Z"
      stroke="#9ca3af"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SparklesIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <path
      d="M10.5 3.5L12.25 8.75L17.5 10.5L12.25 12.25L10.5 17.5L8.75 12.25L3.5 10.5L8.75 8.75L10.5 3.5Z"
      stroke="#171717"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19.25 14L20.125 16.625L22.75 17.5L20.125 18.375L19.25 21L18.375 18.375L15.75 17.5L18.375 16.625L19.25 14Z"
      stroke="#171717"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17.5 3.5L18.375 5.25L20.125 6.125L18.375 7L17.5 8.75L16.625 7L14.875 6.125L16.625 5.25L17.5 3.5Z"
      stroke="#171717"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const RocketIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <path
      d="M15.75 17.5L17.5 24.5L14 21L10.5 24.5L12.25 17.5"
      stroke="#171717"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.125 15.75C4.375 14.875 3.5 12.25 3.5 10.5C7.875 10.5 11.375 8.75 14 3.5C16.625 8.75 20.125 10.5 24.5 10.5C24.5 12.25 23.625 14.875 21.875 15.75"
      stroke="#171717"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.5 15.75C10.5 15.75 11.375 12.25 14 12.25C16.625 12.25 17.5 15.75 17.5 15.75"
      stroke="#171717"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LayerGroupIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <path
      d="M14 3.5L24.5 9.625L14 15.75L3.5 9.625L14 3.5Z"
      stroke="#171717"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3.5 18.375L14 24.5L24.5 18.375"
      stroke="#171717"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3.5 14L14 20.125L24.5 14"
      stroke="#171717"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const StarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3L14.75 9.25L21.6 9.9L16.5 14.45L17.85 21L12 17.65L6.15 21L7.5 14.45L2.4 9.9L9.25 9.25L12 3Z"
      fill="black"
    />
  </svg>
);

interface PlanFeature {
  text: string;
}

interface PricingPlanData {
  icon: React.ReactNode;
  name: string;
  description?: string;
  price: string;
  period?: string;
  subtitle?: string;
  href?: string;
  // When true the CTA opens in a new tab (e.g. the Calendly demo link). Internal
  // signup links navigate in the same tab so the post-signup flow stays intact.
  external?: boolean;
  buttonText: string;
  buttonStyle: "outline-solid" | "gradient";
  features: PlanFeature[];
  footerNote?: string;
  lockedFeatures?: PlanFeature[];
  overages?: string[];
  highlighted?: boolean;
}

const plans: PricingPlanData[] = [
  {
    icon: <SparklesIcon />,
    name: "Free",
    description: "Best for agents testing AI follow-up",
    price: "$0",
    period: "/month",
    // Free -> straight to signup -> onboarding (email-only; upgrade later).
    href: "/signup",
    buttonText: "Start Free",
    buttonStyle: "outline-solid",
    features: [
      { text: "1 seat" },
      { text: "Centralized lead inbox" },
      { text: "Email outreach only" },
      { text: "500 emails / month" },
      { text: "AI email writer (limited credits)" },
      { text: "1 basic follow-up sequence (3 steps)" },
      { text: "Auto-response (email only, basic rules)" },
    ],
    footerNote: "Upgrade to unlock SMS",
    lockedFeatures: [
      { text: "SMS outreach" },
      { text: "AI auto-replies" },
      { text: "Advanced sequences" },
      { text: "Automation" },
    ],
  },
  {
    icon: <SparklesIcon />,
    name: "Starter",
    price: "$89",
    period: "/month",
    description: "Best for new Agents",
    // Paid -> signup -> Stripe checkout -> onboarding (SMS + email).
    href: "/signup?plan=starter",
    buttonText: "Start Now",
    buttonStyle: "gradient",
    features: [
      { text: "1 seat" },
      { text: "1,250 SMS / month" },
      { text: "10,000 emails / month" },
      { text: "2,500 AI messages" },
      { text: "1000 calling minutes" },
      { text: "AI instant reply" },
      { text: "Lead inbox" },
      { text: "Templates" },
    ],
    overages: [
      "Extra SMS: $0.015",
      "Extra Emails: $0.002",
      "Extra AI Messages: $0.002",
      "Extra Calling Minutes: $0.015",
    ],
  },
  {
    icon: <RocketIcon />,
    name: "Growth",
    price: "$149",
    period: "/month",
    description: "Best for Active Agents",
    // Paid -> signup -> Stripe checkout -> onboarding (SMS + email).
    href: "/signup?plan=growth",
    buttonText: "Start Now",
    buttonStyle: "gradient",
    highlighted: true,
    features: [
      { text: "1 seat" },
      { text: "2,500 SMS / month" },
      { text: "20,000 emails / month" },
      { text: "15,000 AI messages" },
      { text: "3750 calling minutes" },
      { text: "AI follow-up sequences" },
      { text: "Automation" },
      { text: "Appointment alerts" },
      { text: "Advanced templates" },
    ],
    overages: [
      "Extra SMS: $0.015",
      "Extra Emails: $0.002",
      "Extra AI Messages: $0.002",
      "Extra Calling Minutes: $0.015",
    ],
  },
  {
    icon: <LayerGroupIcon />,
    name: "Custom Brokerage",
    href: "https://calendly.com/velasquezjojo7/30min",
    external: true,
    description:
      "For teams and brokerages looking to scale lead conversion with AI.",
    price: "Custom",
    buttonText: "Book Demo",
    buttonStyle: "gradient",
    features: [
      { text: "Multi-agent onboarding" },
      { text: "Team management" },
      { text: "AI follow-up automation" },
      { text: "Shared templates" },
      { text: "Priority support" },
      { text: "Custom onboarding" },
      { text: "Volume pricing" },
    ],
  },
];

const PricingPlan = () => {
  const [visibleSections, setVisibleSections] = useState<Set<string>>(
    new Set(),
  );

  const setRef = (key: string) => (el: HTMLElement | null) => {
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set(prev).add(key));
          }
        });
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  };

  const isVisible = (key: string) => visibleSections.has(key);

  return (
    <section className="w-full bg-white py-6 lg:pt-20 lg:pb-20 px-4 sm:px-10 relative overflow-hidden">
      <div
        className="hidden lg:block absolute top-28 left-1/2 -translate-x-[calc(50%+27px)] w-175 h-161 pointer-events-none"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(249, 115, 22, 0.12) 0%, rgba(249, 115, 22, 0.06) 50%, transparent 100%)",
          filter: "blur(80px)",
        }}
      />
      <div className="max-w-400 mx-auto relative">
        <div
          ref={setRef("header")}
          className="flex flex-col items-center gap-5 max-w-209.75 mx-auto"
        >
          <div className="flex flex-col items-center gap-0.5">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 transition-all duration-700 ease-out ${
                isVisible("header")
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #FB923C 0%, #F97316 86%)",
                }}
              />
              <span className="text-sm font-semibold leading-4.5 tracking-[0.024px] text-[#F97316]">
                Pricing plan
              </span>
            </div>

            <h2
              className={`text-2xl lg:text-5xl font-medium leading-8 lg:leading-15 tracking-[-0.036px] lg:tracking-[-0.96px] text-[#171717] text-center transition-all duration-700 ease-out ${
                isVisible("header")
                  ? "translate-y-0 opacity-100"
                  : "translate-y-8 opacity-0"
              }`}
              style={{ transitionDelay: "150ms" }}
            >
              Choose your WarmChats plan
            </h2>
          </div>

          <p
            className={`text-base leading-6 text-[#5c5c5c] text-center max-w-194.5 transition-all duration-700 ease-out ${
              isVisible("header")
                ? "translate-y-0 opacity-100"
                : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: "300ms" }}
          >
            WarmChats handles the speed, the follow-up, and the qualification so
            you only step in when it&apos;s time to close the deal.
          </p>
        </div>

        <div
          ref={setRef("cards")}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mt-10 lg:mt-20"
        >
          {plans.map((plan, i) => (
            <div
              key={plan.name}
              ref={setRef(`card-${i}`)}
              className={`relative flex max-sm:mt-4 flex-col rounded-2xl border  transition-all duration-700 ease-out ${
                isVisible(`card-${i}`)
                  ? "translate-y-0 opacity-100"
                  : "translate-y-16 opacity-0"
              } ${
                plan.highlighted
                  ? "border-[#ebebeb] bg-white"
                  : "border-[#ebebeb] bg-white p-2"
              }`}
              style={{
                transitionDelay: `${i * 150}ms`,
                ...(plan.highlighted
                  ? {
                      backgroundImage:
                        "linear-gradient(180deg, rgba(249, 115, 22, 0.12) 6.5%, rgba(249, 115, 22, 0.08) 93.7%)",
                    }
                  : {}),
              }}
            >
              {plan.highlighted && (
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-2.5 border border-[#F97316] rounded-full px-7 md:px-10.5 py-2 md:py-3.5"
                  style={{
                    backgroundImage:
                      "linear-gradient(91deg, rgba(251, 146, 60, 0.4) 0%, rgba(249, 115, 22, 0.4) 86%)",
                  }}
                >
                  <span className="text-sm md:text-base font-semibold leading-6 text-black whitespace-nowrap">
                    Most Popular
                  </span>
                  <StarIcon />
                </div>
              )}

              <div
                className={`flex flex-col gap-8 lg:gap-10 bg-white rounded-xl lg:rounded-2xl px-6 lg:px-8 py-8 lg:py-10 flex-1 ${
                  plan.highlighted ? "rounded-xl" : ""
                }`}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    {plan.icon}
                    <span className="text-xl lg:text-2xl font-semibold leading-8 tracking-[-0.036px] text-[#171717]">
                      {plan.name}
                    </span>
                  </div>
                  {plan.description && (
                    <p className="text-base leading-6 text-[#5c5c5c]">
                      {plan.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-7">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-end">
                      <span className="text-[40px] lg:text-[48px] font-semibold leading-14 tracking-[-0.48px] text-black">
                        {plan.price}
                      </span>
                      {plan.period && (
                        <span className="text-base leading-6 text-[#171717] pb-1">
                          {plan.period}
                        </span>
                      )}
                    </div>
                    {plan.subtitle && (
                      <p className="text-base leading-6 text-[#5c5c5c]">
                        {plan.subtitle}
                      </p>
                    )}
                  </div>

                  {plan.buttonStyle === "outline-solid" ? (
                    <a
                      href={plan.href || "#"}
                      target={plan.external ? "_blank" : undefined}
                      rel={plan.external ? "noopener noreferrer" : undefined}
                      className="btn-outline-hover relative flex items-center justify-center h-11 rounded-full border border-[#F97316] text-base font-semibold leading-6"
                    >
                      <span className="btn-label">{plan.buttonText}</span>
                      <span className="btn-label-hover">{plan.buttonText}</span>
                    </a>
                  ) : (
                    <a
                      href={plan.href || "#"}
                      target={plan.external ? "_blank" : undefined}
                      rel={plan.external ? "noopener noreferrer" : undefined}
                      className="btn-gradient-hover flex items-center justify-center h-11 rounded-full text-base font-semibold leading-6 text-white"
                      style={{
                        backgroundImage:
                          "linear-gradient(90deg, #FB923C 0%, #F97316 50%, #FB923C 100%)",
                        backgroundSize: "200% auto",
                      }}
                    >
                      {plan.buttonText}
                    </a>
                  )}
                </div>

                <div className="flex flex-col">
                  {plan.features.map((feature, j) => (
                    <div
                      key={j}
                      className={`flex items-center gap-2 py-4 ${
                        j < plan.features.length - 1
                          ? "border-b border-[#ebebeb]"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-center w-4 h-4 rounded-full bg-[#171717] shrink-0">
                        <CheckIcon />
                      </div>
                      <span className="text-base leading-6 text-[#5c5c5c]">
                        {feature.text}
                      </span>
                    </div>
                  ))}

                  {plan.footerNote && (
                    <div className="mt-4 bg-[#fbfaf9] rounded-[35px] p-4">
                      <p className="text-base leading-6 text-[#5c5c5c]">
                        {plan.footerNote}
                      </p>
                    </div>
                  )}

                  {plan.lockedFeatures && plan.lockedFeatures.length > 0 && (
                    <div className="mt-4 flex flex-col">
                      {plan.lockedFeatures.map((feature, j) => (
                        <div
                          key={`locked-${j}`}
                          className={`flex items-center gap-2 py-4 ${
                            j < (plan.lockedFeatures?.length ?? 0) - 1
                              ? "border-b border-[#ebebeb]"
                              : ""
                          }`}
                        >
                          <div className="flex items-center justify-center w-4 h-4 rounded-full bg-[#f3f4f6] shrink-0">
                            <LockIcon />
                          </div>
                          <span className="text-base leading-6 text-[#9ca3af] line-through">
                            {feature.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {plan.overages && plan.overages.length > 0 && (
                    <div className="mt-4 bg-[#fbfaf9] rounded-[20px] p-4">
                      <p className="text-sm font-semibold leading-6 text-[#171717] mb-1">
                        Overages
                      </p>
                      <ul className="flex flex-col gap-1">
                        {plan.overages.map((item, j) => (
                          <li
                            key={`overage-${j}`}
                            className="text-base leading-6 text-[#5c5c5c]"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p
          className="mt-7"
          style={{
            color: "#5C5C5C",
            textAlign: "center",
            fontSize: "16px",
            fontWeight: "400",
            lineHeight: "24px",
          }}
        >
          No contracts. Cancel anytime.
        </p>
      </div>
      <div className="flex items-center justify-center">
        <a
          href="https://calendly.com/velasquezjojo7/30min"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-gradient-hover px-7 mt-4 flex items-center justify-center h-11 rounded-full text-base font-semibold leading-6 text-white"
          style={{
            backgroundImage:
              "linear-gradient(90deg, #FB923C 0%, #F97316 50%, #FB923C 100%)",
            backgroundSize: "200% auto",
          }}
        >
          Book a Demo
        </a>
      </div>
    </section>
  );
};

export default PricingPlan;
