"use client";

import { useEffect, useRef, useState } from "react";

interface CardData {
  icon: string;
  title: string;
  description: string;
  highlight: string;
  highlighted?: boolean;
}

const cards: CardData[] = [
  {
    icon: "/images/icon-more-square.svg",
    title: "Instant Lead Response",
    description:
      "The moment a lead comes in, WarmChats responds in seconds so you're always first.",
    highlight: "First agent to respond wins most deals.",
    highlighted: true,
  },
  {
    icon: "/images/icon-bolt.svg",
    title: "AI Qualification Engine",
    description:
      "WarmChats asks smart questions to understand timeline, budget, and intent.",
    highlight: "Instantly know who's ready to buy or sell.",
    highlighted: true,
  },
  {
    icon: "/images/icon-notification.svg",
    title: "Automated Follow-Ups",
    description:
      "Smart follow-ups continue for 30, 60, or 90 days until the lead is ready.",
    highlight: "Every lead gets consistent follow-ups.",
    highlighted: true,
  },
  {
    icon: "/images/icon-sent.svg",
    title: "Appointment Alerts",
    description:
      "When a lead shows intent, you're notified immediately so you can jump in.",
    highlight: "Jump in only when the lead is ready.",
    highlighted: true,
  },
];

const SendMessages = () => {
  const [visibleSections, setVisibleSections] = useState<Set<string>>(
    new Set(),
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const elements =
      container.querySelectorAll<HTMLElement>("[data-anim-key]");
    const observers: IntersectionObserver[] = [];

    elements.forEach((element) => {
      const key = element.dataset.animKey;
      if (!key) return;
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
      observer.observe(element);
      observers.push(observer);
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, []);

  const isVisible = (key: string) => visibleSections.has(key);

  return (
    <section className="w-full bg-white py-10 lg:pt-20 lg:pb-15 px-4 sm:px-10">
      <div ref={containerRef} className="max-w-400 mx-auto relative">
        <div className="absolute left-1/2 -translate-x-1/2 top-7 lg:top-28 w-81 lg:w-108.25 h-68.5 lg:h-86 pointer-events-none">
          <div className="w-full h-full rounded-full bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.08)_0%,rgba(249,115,22,0.04)_40%,transparent_70%)] blur-2xl" />
        </div>

        <div
          data-anim-key="send-header"
          className="flex flex-col items-center gap-5 max-w-209.75 mx-auto relative z-1"
        >
          <div className="flex flex-col items-center gap-0.5">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 transition-all duration-700 ease-out ${
                isVisible("send-header")
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
                Send Messages
              </span>
            </div>

            <h2
              className={`text-2xl lg:text-5xl font-medium leading-8 lg:leading-15 tracking-[-0.036px] lg:tracking-[-0.96px] text-[#171717] text-center transition-all duration-700 ease-out ${
                isVisible("send-header")
                  ? "translate-y-0 opacity-100"
                  : "translate-y-8 opacity-0"
              }`}
              style={{ transitionDelay: "150ms" }}
            >
              How WarmChats Sends Messages
            </h2>
          </div>

          <p
            className={`text-base leading-6 text-[#5c5c5c] text-center max-w-194.5 transition-all duration-700 ease-out ${
              isVisible("send-header")
                ? "translate-y-0 opacity-100"
                : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: "300ms" }}
          >
            WarmChats instantly engages every lead, follows up relentlessly, and
            turns conversations into booked appointments.
          </p>
        </div>

        <div
          data-anim-key="send-cards"
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-8 mt-14 lg:mt-14 relative z-1"
        >
          {cards.map((card, i) => (
            <div
              key={card.title}
              data-anim-key={`send-card-${i}`}
              className={`flex flex-col gap-6 px-6 py-8 rounded-2xl transition-all duration-700 ease-out hover:shadow-lg hover:-translate-y-1 ${
                card.highlighted ? "" : "bg-white border border-[#ebebeb]"
              } ${
                isVisible(`send-card-${i}`)
                  ? "translate-y-0 opacity-100"
                  : "translate-y-14 opacity-0"
              }`}
              style={{
                transitionDelay: `${i * 150}ms`,
                ...(card.highlighted
                  ? {
                      backgroundImage:
                        "linear-gradient(180deg, #fff7f2 6.5%, #fff0e8 93.7%)",
                    }
                  : {}),
              }}
            >
              <div
                className="flex items-center justify-center w-10.5 h-10.5 rounded-full p-0.75 shrink-0"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #FB923C 0%, #F97316 86%)",
                }}
              >
                <img src={card.icon} alt="" width={24} height={24} />
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  <h3 className="text-2xl font-semibold leading-9.5 tracking-[-0.048px] text-[#171717]">
                    {card.title}
                  </h3>
                  <p className="text-base leading-6 text-[#5c5c5c]">
                    {card.description}
                  </p>
                </div>
                <p className="text-sm font-semibold leading-5.5 text-[#ff6b35]">
                  {card.highlight}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div
          data-anim-key="cta"
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
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
};

export default SendMessages;
