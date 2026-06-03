"use client";

import { useCallback, useState } from "react";

interface StepData {
  step: string;
  icon: string;
  iconSize: number;
  title: string;
  description: string;
  highlighted?: boolean;
}

const steps: StepData[] = [
  {
    step: "Step 1",
    icon: "/images/icon-comment-multi.svg",
    iconSize: 36,
    title: "Instant AI Reply",
    description:
      "The moment a lead comes in from Zillow, Facebook, or your website, WarmChats responds within seconds.",
    highlighted: true,
  },
  {
    step: "Step 2",
    icon: "/images/icon-target.svg",
    iconSize: 32,
    title: "AI Follow-Up That Never Stops",
    description:
      "WarmChats continues the conversation with intelligent follow-ups until the lead responds.",
    highlighted: true,
  },
  {
    step: "Step 3",
    icon: "/images/icon-calendar.svg",
    iconSize: 36,
    title: "Close-Ready Notifications",
    description:
      "When a lead shows buying intent, you get notified instantly so you can jump in and close.",
    highlighted: true,
  },
];

interface StatData {
  value: string;
  label: string;
}

const stats: StatData[] = [
  { value: "3x", label: "Faster Response" },
  { value: "40%", label: "More Replies" },
  { value: "2x", label: "More Appointments" },
];

const AutoBooking = () => {
  const [visibleSections, setVisibleSections] = useState<Set<string>>(
    new Set(),
  );

  const observeRoot = useCallback((root: HTMLElement | null) => {
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const key = (entry.target as HTMLElement).dataset.visKey;
            if (key) {
              setVisibleSections((prev) => new Set(prev).add(key));
            }
          }
        });
      },
      { threshold: 0.2 },
    );
    root
      .querySelectorAll<HTMLElement>("[data-vis-key]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const isVisible = (key: string) => visibleSections.has(key);

  return (
    <section className="w-full bg-white py-6 lg:pt-20 lg:pb-15 px-4 sm:px-10">
      <div ref={observeRoot} className="max-w-400 mx-auto">
        <div
          data-vis-key="auto-header"
          className="flex flex-col items-center gap-5 max-w-209.75 mx-auto"
        >
          <div className="flex flex-col items-center gap-0.5">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 transition-all duration-700 ease-out ${
                isVisible("auto-header")
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
                Book Appointments Automatically
              </span>
            </div>

            <h2
              className={`text-2xl lg:text-5xl font-medium leading-8 lg:leading-15 tracking-[-0.036px] lg:tracking-[-0.96px] text-[#171717] text-center transition-all duration-700 ease-out ${
                isVisible("auto-header")
                  ? "translate-y-0 opacity-100"
                  : "translate-y-8 opacity-0"
              }`}
              style={{ transitionDelay: "150ms" }}
            >
              Turn Every Lead Into a Conversation Automatically
            </h2>
          </div>

          <p
            className={`text-base leading-6 text-[#5c5c5c] text-center max-w-194.5 transition-all duration-700 ease-out ${
              isVisible("auto-header")
                ? "translate-y-0 opacity-100"
                : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: "300ms" }}
          >
            WarmChats instantly responds to new leads, follows up automatically,
            and alerts you when a client is ready to move forward.
          </p>
        </div>

        <div
          data-vis-key="auto-steps"
          className="grid grid-cols-1 md:grid-cols-3 gap-17.5 md:gap-6 mt-20 lg:mt-20.25"
        >
          {steps.map((step, i) => (
            <div
              key={step.step}
              data-vis-key={`auto-step-${i}`}
              className={`relative rounded-2xl pt-13.25 pb-8 lg:pb-10 px-4 lg:px-10 flex flex-col items-center gap-7 lg:gap-10 text-center transition-all duration-700 ease-out hover:shadow-lg hover:-translate-y-1 ${
                step.highlighted ? "" : "bg-white border border-[#ebebeb]"
              } ${
                isVisible(`auto-step-${i}`)
                  ? "translate-y-0 opacity-100"
                  : "translate-y-14 opacity-0"
              }`}
              style={{
                transitionDelay: `${i * 150}ms`,
                ...(step.highlighted
                  ? {
                      backgroundImage:
                        "linear-gradient(180deg, #fff7f2 6.5%, #fff0e8 93.7%)",
                    }
                  : {}),
              }}
            >
              <div
                className={`absolute -top-8 left-1/2 -translate-x-1/2 w-14.5 h-14.5 lg:w-15.75 lg:h-15.75 bg-white border border-[#F97316] rounded-full flex items-center justify-center shadow-[0_4px_4px_0_rgba(249,115,22,0.28)] transition-all duration-700 ease-out ${
                  isVisible(`auto-step-${i}`)
                    ? "translate-y-0 opacity-100 scale-100"
                    : "-translate-y-4 opacity-0 scale-75"
                }`}
                style={{ transitionDelay: `${i * 150 + 200}ms` }}
              >
                <img
                  src={step.icon}
                  alt=""
                  width={step.iconSize}
                  height={step.iconSize}
                />
              </div>

              <p
                className="text-xl font-semibold leading-6.5 bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #FB923C 0%, #F97316 86%)",
                }}
              >
                {step.step}
              </p>

              <div className="flex flex-col gap-6">
                <h3 className="text-2xl font-semibold leading-8 tracking-[-0.036px] text-[#171717]">
                  {step.title}
                </h3>
                <p className="text-lg leading-7 text-[#5c5c5c]">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div
          data-vis-key="auto-stats"
          className={`mt-10 lg:mt-16.25 rounded-2xl lg:rounded-[60px] py-5 px-8 sm:px-25 transition-all duration-700 ease-out ${
            isVisible("auto-stats")
              ? "translate-y-0 opacity-100"
              : "translate-y-10 opacity-0"
          }`}
          style={{
            backgroundImage:
              "linear-gradient(180deg, #fff7f2 6.5%, #fff0e8 93.7%)",
            transitionDelay: "200ms",
          }}
        >
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-0 lg:gap-0 py-5">
            {stats.map((stat, i) => (
              <div
                key={stat.value}
                className="flex flex-col lg:contents w-full"
              >
                <div
                  className={`flex items-center gap-2 whitespace-nowrap py-5 lg:py-0 transition-all duration-700 ease-out ${
                    isVisible("auto-stats")
                      ? "translate-y-0 opacity-100 scale-100"
                      : "translate-y-6 opacity-0 scale-90"
                  }`}
                  style={{ transitionDelay: `${400 + i * 200}ms` }}
                >
                  <span className="text-4xl lg:text-5xl font-semibold leading-11 lg:leading-14 tracking-[-0.18px] lg:tracking-[-0.48px] text-[#171717]">
                    {stat.value}
                  </span>
                  <span className="text-base leading-6 text-[#171717]">
                    {stat.label}
                  </span>
                </div>

                {i < stats.length - 1 && (
                  <>
                    <div className="hidden lg:block w-px h-14 bg-[#ebebeb]" />
                    <div className="lg:hidden w-full h-px bg-[#ebebeb]" />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <div
          data-vis-key="cta"
          className={`flex justify-center mt-10 lg:mt-14 transition-all duration-700 ease-out ${
            isVisible("cta")
              ? "translate-y-0 opacity-100 scale-100"
              : "translate-y-8 opacity-0 scale-95"
          }`}
        >
          <a
            href="/waitlist"
            className="btn-gradient-hover flex items-center justify-center h-12 lg:h-13 w-full lg:w-auto px-10.5 rounded-full text-sm lg:text-xl font-semibold leading-5 lg:leading-7.5 text-white whitespace-nowrap"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #FB923C 0%, #F97316 50%, #FB923C 100%)",
              backgroundSize: "200% auto",
            }}
          >
            Get a Demo
          </a>
        </div>
      </div>
    </section>
  );
};

export default AutoBooking;
