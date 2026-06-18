"use client";

import { useMemo, useState } from "react";

const steps = [
  {
    image: "/images/card-instant.webp",
    title: "Instant Responses",
    description:
      "Respond to every new lead in under 60 seconds with AI-powered messages so you're always first and never lose a deal to a faster agent.",
  },
  {
    image: "/images/card-smart.webp",
    title: "Smart Qualification",
    description:
      "Automatically qualify leads, identify serious buyers, and move them toward appointments without spending hours texting back and forth.",
  },
  {
    image: "/images/card-booking.webp",
    title: "Booking Alerts",
    description:
      "Get real-time alerts when a lead is ready to book-so you can jump in at the perfect moment and close faster.",
  },
];

const HowItWorks = () => {
  const [visibleSections, setVisibleSections] = useState<Set<string>>(
    new Set(),
  );

  const refCallbacks = useMemo(() => {
    const keys = [
      "header",
      "cards",
      "cta",
      ...steps.map((_, i) => `step-${i}`),
    ];
    const makeCallback =
      (key: string) =>
      (el: HTMLElement | null): (() => void) | void => {
        if (!el) return;
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                setVisibleSections((prev) => new Set(prev).add(key));
              }
            });
          },
          { threshold: 0.2 },
        );
        observer.observe(el);
        return () => observer.disconnect();
      };
    return Object.fromEntries(keys.map((key) => [key, makeCallback(key)]));
  }, []);

  const setRef = (key: string) => refCallbacks[key];

  const isVisible = (key: string) => visibleSections.has(key);

  return (
    <section className="w-full bg-white pt-6 lg:pt-20 pb-6 lg:pb-15 px-4 sm:px-10">
      <div className="max-w-400 mx-auto">
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
                How It Works
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
              How WarmChats Turns New Leads Into Booked Appointments
            </h2>
          </div>

          <p
            className={`text-base leading-6 text-[#475467] lg:text-[#5c5c5c] text-center max-w-194.5 transition-all duration-700 ease-out ${
              isVisible("header")
                ? "translate-y-0 opacity-100"
                : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: "300ms" }}
          >
            WarmChats handles the speed, the follow-up, and the qualification so
            you only step in when it&apos;s time to win the deal.
          </p>
        </div>

        <div
          ref={setRef("cards")}
          className="flex flex-col lg:flex-row gap-6 mt-10 lg:mt-15"
        >
          {steps.map((step, i) => (
            <div
              key={step.title}
              ref={setRef(`step-${i}`)}
              className={`group relative flex-1 rounded-[11px] lg:rounded-[20px] overflow-hidden transition-all duration-700 ease-out hover:shadow-xl hover:-translate-y-1 ${
                isVisible(`step-${i}`)
                  ? "translate-y-0 opacity-100"
                  : "translate-y-16 opacity-0"
              }`}
              style={{
                transitionDelay: `${i * 200}ms`,
                backgroundImage:
                  "linear-gradient(181deg, #fff7f2 13%, #fff0e8 93%)",
              }}
            >
              <div className="absolute inset-0 opacity-[0.15] pointer-events-none">
                <div
                  className="w-full h-full"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, #F97316 1px, transparent 1px)",
                    backgroundSize: "26px 26px",
                  }}
                />
              </div>

              <div
                className="absolute bottom-0 left-0 right-0 h-[50%] pointer-events-none z-1"
                style={{
                  backgroundImage:
                    "linear-gradient(to bottom, rgba(255,247,242,0) 0%, rgba(255,243,234,0.79) 32%, white 100%)",
                }}
              />

              <div className="relative z-2 flex flex-col items-center p-5 lg:p-7">
                <div
                  className={`w-full max-w-96.75 rounded-lg lg:rounded-xl overflow-hidden transition-all duration-700 ease-out ${
                    isVisible(`step-${i}`)
                      ? "scale-100 opacity-100"
                      : "scale-90 opacity-0"
                  }`}
                  style={{ transitionDelay: `${200 + i * 200}ms` }}
                >
                  <img
                    src={step.image}
                    alt={step.title}
                    width={3870}
                    height={3180}
                    className="w-full h-auto rounded-lg lg:rounded-xl"
                  />
                </div>

                <div
                  className={`flex flex-col items-center gap-1 lg:gap-2 mt-2.5 lg:mt-4 text-center transition-all duration-700 ease-out ${
                    isVisible(`step-${i}`)
                      ? "translate-y-0 opacity-100"
                      : "translate-y-6 opacity-0"
                  }`}
                  style={{ transitionDelay: `${400 + i * 200}ms` }}
                >
                  <h3 className="text-base lg:text-2xl font-semibold leading-6 lg:leading-8 tracking-[-0.024px] lg:tracking-[-0.036px] text-[#171717]">
                    {step.title}
                  </h3>
                  <p className="text-xs lg:text-lg leading-4.5 lg:leading-7 text-[#5c5c5c]">
                    {step.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          ref={setRef("cta")}
          className={`flex justify-center mt-10 lg:mt-14 transition-all duration-700 ease-out ${
            isVisible("cta")
              ? "translate-y-0 opacity-100 scale-100"
              : "translate-y-8 opacity-0 scale-95"
          }`}
        >
          <a
            href="https://calendly.com/jvrealestate2/15min"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-gradient-hover flex items-center justify-center h-12 lg:h-13 w-full lg:w-auto px-10.5 rounded-full text-sm lg:text-xl font-semibold leading-5 lg:leading-7.5 text-white whitespace-nowrap"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #FB923C 0%, #F97316 50%, #FB923C 100%)",
              backgroundSize: "200% auto",
            }}
          >
            See It In Action
          </a>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
