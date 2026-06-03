"use client";

import { useEffect, useRef, useState } from "react";

const TryItOn = () => {
  const [isShown, setIsShown] = useState(false);
  const tryItRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = tryItRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsShown(true);
          }
        });
      },
      { threshold: 0.3 },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <section className="w-full bg-white py-6 lg:pt-20 lg:pb-15 px-4 sm:px-10">
      <div
        ref={tryItRef}
        className="max-w-400 mx-auto relative overflow-hidden rounded-2xl lg:rounded-[60px] px-3 lg:px-40 py-8 lg:py-20 flex flex-col items-center gap-4.5 lg:gap-10"
        style={{
          backgroundImage:
            "linear-gradient(180deg, #fff7f2 6.5%, #fff0e8 93.7%)",
        }}
      >
        <div className="absolute z-1 left-13 -top-20.25 w-106 h-148.75 items-center justify-center pointer-events-none hidden lg:flex">
          <div className="rotate-[-37.57deg] skew-x-[-5.75deg]">
            <div className="w-33 h-151.25 bg-linear-to-b from-transparent via-white/45 to-transparent" />
          </div>
        </div>
        <div className="absolute z-1 right-0 -top-31 w-175 h-147.75 items-center justify-center pointer-events-none hidden lg:flex">
          <div className="rotate-[44.84deg] skew-x-[-5.75deg]">
            <div className="w-32 h-197 bg-linear-to-b from-transparent via-white/45 to-transparent" />
          </div>
        </div>

        <h2
          className={`text-2xl lg:text-5xl font-medium leading-8 lg:leading-15 tracking-[-0.036px] lg:tracking-[-0.96px] text-[#171717] text-center transition-all duration-700 ease-out ${
            isShown
              ? "translate-y-0 opacity-100"
              : "translate-y-8 opacity-0"
          }`}
        >
          Ready to Stop Chasing Leads?
        </h2>

        <p
          className={`text-base leading-6 text-[#5c5c5c] text-center max-w-62.5 lg:max-w-194.5 transition-all duration-700 ease-out ${
            isShown
              ? "translate-y-0 opacity-100"
              : "translate-y-6 opacity-0"
          }`}
          style={{ transitionDelay: "150ms" }}
        >
          Turn every new lead into a conversation, appointment, and deal
          automatically.
        </p>

        <div
          className={`transition-all duration-700 ease-out ${
            isShown
              ? "translate-y-0 opacity-100 scale-100"
              : "translate-y-8 opacity-0 scale-95"
          }`}
          style={{ transitionDelay: "300ms" }}
        >
          <a
            href="/waitlist"
            className="btn-gradient-hover flex items-center justify-center h-13 px-10.5 rounded-full text-lg lg:text-xl font-semibold leading-7.5 text-white whitespace-nowrap"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #FB923C 0%, #F97316 50%, #FB923C 100%)",
              backgroundSize: "200% auto",
            }}
          >
            Try It On Your Leads
          </a>
        </div>
      </div>
    </section>
  );
};

export default TryItOn;
