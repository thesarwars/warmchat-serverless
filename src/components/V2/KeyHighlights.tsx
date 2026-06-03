"use client";

import { useMemo, useState } from "react";

const features = [
  {
    stat: "3x",
    icon: "/images/icon-comment.svg",
    title: "More Replies From  New Leads",
    description: (
      <>
        Respond in{" "}
        <span className="font-semibold text-[#f15045]">under 60 seconds</span>
      </>
    ),
  },
  {
    stat: "10+",
    icon: "/images/icon-time.svg",
    title: "Hours Saved Every Week",
    description: <>Automated follow-up &amp; scheduling</>,
  },
  {
    stat: "24/7",
    icon: "/images/icon-engine.svg",
    title: "Lead Response & Nurture Engine",
    description: (
      <>
        <span className="font-semibold">Never miss</span> another opportunity
      </>
    ),
  },
];

const KeyHighlights = () => {
  const [visibleSections, setVisibleSections] = useState<Set<string>>(
    new Set(),
  );

  const refCallbacks = useMemo(() => {
    const keys = ["highlights", ...features.map((_, i) => `card-${i}`)];
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
    <section className="w-full bg-white py-11.5 lg:py-20 px-4 sm:px-10">
      <div
        ref={setRef("highlights")}
        className="max-w-399.75 mx-auto flex flex-col lg:flex-row gap-17.5 lg:gap-6 items-stretch"
      >
        {features.map((feature, i) => (
          <div
            key={feature.stat}
            ref={setRef(`card-${i}`)}
            className={`relative flex-1 bg-white border border-[#ebebeb] rounded-2xl pt-13.25 pb-10 px-10 flex flex-col items-center text-center transition-all duration-700 ease-out hover:shadow-lg hover:-translate-y-1 ${
              isVisible(`card-${i}`)
                ? "translate-y-0 opacity-100"
                : "translate-y-12 opacity-0"
            }`}
            style={{ transitionDelay: `${i * 150}ms` }}
          >
            <div
              className={`absolute -top-7.75 left-1/2 -translate-x-1/2 w-14.5 h-14.5 lg:w-15.75 lg:h-15.75 rounded-full bg-white border border-[#F97316] flex items-center justify-center shadow-[0px_4px_4px_0px_rgba(249,115,22,0.28)] transition-all duration-500 ease-out ${
                isVisible(`card-${i}`)
                  ? "scale-100 opacity-100"
                  : "scale-50 opacity-0"
              }`}
              style={{ transitionDelay: `${200 + i * 150}ms` }}
            >
              <img
                src={feature.icon}
                alt=""
                className="w-6 h-6 lg:w-9 lg:h-9"
                width={36}
                height={36}
              />
            </div>

            <p
              className={`text-[36px] lg:text-[60px] font-semibold lg:font-bold leading-11 lg:leading-18 tracking-[-0.18px] lg:tracking-[-1.2px] bg-linear-to-r from-[#FB923C] to-[#F97316] bg-clip-text transition-all duration-700 ease-out ${
                isVisible(`card-${i}`)
                  ? "scale-100 opacity-100"
                  : "scale-75 opacity-0"
              }`}
              style={{ transitionDelay: `${300 + i * 150}ms` }}
            >
              {feature.stat}
            </p>

            <div
              className={`flex flex-col gap-3.5 mt-4 lg:mt-6 w-full transition-all duration-700 ease-out ${
                isVisible(`card-${i}`)
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }`}
              style={{ transitionDelay: `${450 + i * 150}ms` }}
            >
              <h3 className="text-2xl font-medium leading-8 tracking-[-0.036px] text-[#171717]">
                {feature.title}
              </h3>
              <p className="text-xs lg:text-base leading-4.5 lg:leading-6 tracking-[0.024px] lg:tracking-normal text-[#5c5c5c]">
                {feature.description}
              </p>
            </div>

            <div
              className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-0.75 rounded-[9px] transition-all duration-700 ease-out ${
                isVisible(`card-${i}`)
                  ? "w-24.75 lg:w-25.5 opacity-100"
                  : "w-0 opacity-0"
              }`}
              style={{
                backgroundImage:
                  "linear-gradient(94deg, #FB923C 0%, #F97316 86%)",
                transitionDelay: `${600 + i * 150}ms`,
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
};

export default KeyHighlights;
