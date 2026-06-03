"use client";

import { useCallback, useState } from "react";

const manualItems = [
  "Slow responses",
  "Leads go cold",
  "Missed follow-ups",
  "Conversations lost",
  "Constant chasing",
];

const automationItems = [
  "Instant replies",
  "3x more replies",
  "Automated nurturing",
  "All messages tracked",
  "Works 24/7",
];

const BookAppointments = () => {
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
    <section
      className="w-full px-2 sm:px-10 py-6 lg:py-20"
      style={{
        backgroundImage: "linear-gradient(180deg, #fff7f2 6.5%, #fff0e8 93.7%)",
      }}
    >
      <div
        ref={observeRoot}
        className="max-w-400 mx-auto relative overflow-hidden rounded-xl lg:rounded-[60px] px-4 sm:px-10 lg:px-40 py-6 lg:py-20"
      >
        <div className="absolute -left-44.25 -top-24.75 w-125 h-180.5 flex items-center justify-center pointer-events-none">
          <div className="rotate-[21.75deg] skew-x-[-5.75deg]">
            <div className="w-42.5 h-185.75 bg-linear-to-b from-transparent via-white/45 to-transparent" />
          </div>
        </div>
        <div className="absolute -right-31 top-43 w-130.25 h-190.5 flex items-center justify-center pointer-events-none">
          <div className="rotate-[21.75deg] skew-x-[-5.75deg]">
            <div className="w-42.5 h-197 bg-linear-to-b from-transparent via-white/45 to-transparent" />
          </div>
        </div>

        <div className="relative z-1 flex flex-col items-center gap-10 lg:gap-14">
          <div
            data-vis-key="book-header"
            className="flex flex-col items-center gap-5 max-w-209.75 mx-auto"
          >
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={`flex items-center gap-1.5 px-3 py-1 transition-all duration-700 ease-out ${
                  isVisible("book-header")
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
                  Booking Appointments
                </span>
              </div>

              <h2
                className={`text-2xl lg:text-5xl font-medium leading-8 lg:leading-15 tracking-[-0.036px] lg:tracking-[-0.96px] text-[#171717] text-center transition-all duration-700 ease-out ${
                  isVisible("book-header")
                    ? "translate-y-0 opacity-100"
                    : "translate-y-8 opacity-0"
                }`}
                style={{ transitionDelay: "150ms" }}
              >
                Stop Chasing Leads. <br /> Let AI Book Appointments for You.
              </h2>
            </div>

            <p
              className={`text-base leading-6 text-[#5c5c5c] text-center max-w-194.5 transition-all duration-700 ease-out ${
                isVisible("book-header")
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }`}
              style={{ transitionDelay: "300ms" }}
            >
              {`Manual follow-up costs deals.
WarmChats makes sure you're always the first to respond.`}
            </p>
          </div>

          <div
            data-vis-key="book-cards"
            className="grid grid-cols-1 lg:grid-cols-2 gap-7.25 w-full max-w-5xl"
          >
            <div
              data-vis-key="card-manual"
              className={`rounded-xl flex flex-col gap-5 transition-all duration-700 ease-out hover:shadow-lg ${
                isVisible("card-manual")
                  ? "translate-y-0 opacity-100"
                  : "translate-y-14 opacity-0"
              }`}
              style={{ transitionDelay: "100ms" }}
            >
              <div className="bg-[#fbfaf9] rounded-2xl px-4 py-5 flex flex-col gap-7">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/images/icon-x-header.svg"
                    alt=""
                    width={33}
                    height={33}
                  />
                  <h3 className="text-lg lg:text-2xl font-semibold leading-7 lg:leading-8 tracking-[-0.036px] text-[#171717]">
                    Manual Follow-Up
                  </h3>
                </div>

                <div className="h-px bg-[#ebebeb]" />

                <div className="flex flex-col gap-5.5">
                  {manualItems.map((item, idx) => (
                    <div
                      key={item}
                      className={`flex items-center gap-3.5 transition-all duration-500 ease-out ${
                        isVisible("card-manual")
                          ? "translate-x-0 opacity-100"
                          : "-translate-x-6 opacity-0"
                      }`}
                      style={{ transitionDelay: `${300 + idx * 100}ms` }}
                    >
                      <img
                        src="/images/icon-x-item.svg"
                        alt=""
                        width={33}
                        height={33}
                        className="shrink-0"
                      />
                      <span className="text-sm lg:text-lg leading-5.5 lg:leading-7 text-[#171717]">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              data-vis-key="card-auto"
              className={`rounded-xl flex flex-col gap-5 transition-all duration-700 ease-out hover:shadow-lg ${
                isVisible("card-auto")
                  ? "translate-y-0 opacity-100"
                  : "translate-y-14 opacity-0"
              }`}
              style={{ transitionDelay: "250ms" }}
            >
              <div className="bg-[#fbfaf9] rounded-2xl px-4 py-5 flex flex-col gap-7">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/images/icon-check-header.svg"
                    alt=""
                    width={33}
                    height={33}
                  />
                  <h3 className="text-lg lg:text-2xl font-semibold leading-7 lg:leading-8 tracking-[-0.036px] text-[#171717]">
                    WarmChats Automation
                  </h3>
                </div>

                <div className="h-px bg-[#ebebeb]" />

                <div className="flex flex-col gap-5.5">
                  {automationItems.map((item, idx) => (
                    <div
                      key={item}
                      className={`flex items-center gap-3.5 transition-all duration-500 ease-out ${
                        isVisible("card-auto")
                          ? "translate-x-0 opacity-100"
                          : "translate-x-6 opacity-0"
                      }`}
                      style={{ transitionDelay: `${300 + idx * 100}ms` }}
                    >
                      <img
                        src="/images/icon-check-item.svg"
                        alt=""
                        width={33}
                        height={33}
                        className="shrink-0"
                      />
                      <span className="text-sm lg:text-lg leading-5.5 lg:leading-7 text-[#171717]">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div
            data-vis-key="book-cta"
            className={`w-full lg:w-auto px-2 transition-all duration-700 ease-out ${
              isVisible("book-cta")
                ? "translate-y-0 opacity-100 scale-100"
                : "translate-y-8 opacity-0 scale-95"
            }`}
            style={{ transitionDelay: "200ms" }}
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
              See It Work On Your Leads
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BookAppointments;
