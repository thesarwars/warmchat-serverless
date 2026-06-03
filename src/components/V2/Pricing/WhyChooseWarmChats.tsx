
import { useCallback, useEffect, useRef, useState } from "react";

const GreenCheck = () => (
  <span className="flex items-center justify-center w-7.5 h-7.5 rounded-full bg-[#18ad79]">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 8L6.5 11L12.5 5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

const RedCross = () => (
  <span className="flex items-center justify-center w-7.5 h-7.5 rounded-full bg-[#fb3748]">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

const features = [
  "Instant lead response",
  "Automatic follow-ups",
  "Smart reply suggestions",
  "Multi-channel outreach",
  "Team collaboration",
  "AI prioritization",
];

const WhyChooseWarmChats = () => {
  const [visibleSections, setVisibleSections] = useState<Set<string>>(
    new Set(),
  );
  const [scrollProgress, setScrollProgress] = useState(0);
  const sectionRefs = useRef<{ [key: string]: HTMLElement | null }>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    Object.entries(sectionRefs.current).forEach(([key, element]) => {
      if (element) {
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
        observer.observe(element);
        observers.push(observer);
      }
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll > 0) {
      setScrollProgress(el.scrollLeft / maxScroll);
    }
  }, []);

  const isVisible = (key: string) => visibleSections.has(key);

  const trackWidth = 304;
  const thumbWidth = 80;
  const maxThumbOffset = trackWidth - thumbWidth;

  return (
    <section className="w-full bg-white py-6 lg:py-20 px-4 sm:px-10">
      <div className="max-w-400 mx-auto flex flex-col gap-8.5 lg:gap-0">
        <div
          ref={(el) => {
            sectionRefs.current["why-header"] = el;
          }}
          className="flex flex-col items-center gap-6 lg:gap-6 max-w-209.75 mx-auto mb-0 lg:mb-20"
        >
          <div className="flex flex-col items-center gap-0.5">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 transition-all duration-700 ease-out ${
                isVisible("why-header")
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
              <span className="text-xs font-semibold leading-4.5 tracking-[0.024px] text-[#F97316]">
                Feature comparison
              </span>
            </div>

            <h2
              className={`text-2xl lg:text-5xl font-medium leading-8 lg:leading-15 tracking-[-0.036px] lg:tracking-[-0.96px] text-[#171717] text-center transition-all duration-700 ease-out ${
                isVisible("why-header")
                  ? "translate-y-0 opacity-100"
                  : "translate-y-8 opacity-0"
              }`}
              style={{ transitionDelay: "150ms" }}
            >
              Why Agents Choose WarmChats
            </h2>
          </div>

          <p
            className={`text-base leading-6 text-[#5c5c5c] text-center max-w-194.5 transition-all duration-700 ease-out ${
              isVisible("why-header")
                ? "translate-y-0 opacity-100"
                : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: "300ms" }}
          >
            Flowkit helps teams and individuals plan, track, and complete their
            work efficiently into one beautiful and intuitive dashboard.
          </p>
        </div>

        <div
          ref={(el) => {
            sectionRefs.current["why-table"] = el;
            scrollContainerRef.current = el;
          }}
          onScroll={handleScroll}
          className={`w-full rounded-2xl overflow-x-auto lg:overflow-hidden transition-all duration-700 ease-out ${
            isVisible("why-table")
              ? "translate-y-0 opacity-100"
              : "translate-y-10 opacity-0"
          }`}
          style={{ transitionDelay: "200ms" }}
        >
          <div className="min-w-180.25 w-full">
            <div className="flex">
              <div
                className="flex-1 h-21.5 lg:h-31 flex items-center px-7.5 rounded-tl-2xl"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #fff7f2 0%, #fff0e8 86%)",
                }}
              >
                <span className="text-lg lg:text-2xl font-semibold leading-7 lg:leading-8 tracking-[-0.036px] text-[#171717] text-center w-full">
                  Feature
                </span>
              </div>
              <div
                className="flex-1 h-21.5 lg:h-31 flex items-center justify-center px-7.5"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #fff7f2 0%, #fff0e8 86%)",
                }}
              >
                <span className="text-lg lg:text-2xl font-semibold leading-7 lg:leading-8 tracking-[-0.036px] text-[#171717] text-center w-full">
                  Manual Follow-Up
                </span>
              </div>
              <div
                className="flex-1 h-21.5 lg:h-31 flex items-center justify-center px-7.5 rounded-tr-2xl"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #fff7f2 0%, #fff0e8 86%)",
                }}
              >
                <span className="text-lg lg:text-2xl font-semibold leading-7 lg:leading-8 tracking-[-0.036px] text-[#171717] text-center w-full">
                  WarmChats
                </span>
              </div>
            </div>

            {features.map((feature, i) => {
              const isLast = i === features.length - 1;
              return (
                <div
                  key={feature}
                  ref={(el) => {
                    sectionRefs.current[`why-row-${i}`] = el;
                  }}
                  className={`flex transition-all duration-600 ease-out ${
                    isVisible(`why-row-${i}`)
                      ? "translate-y-0 opacity-100"
                      : "translate-y-6 opacity-0"
                  }`}
                  style={{ transitionDelay: `${300 + i * 100}ms` }}
                >
                  <div
                    className={`flex-1 h-23 lg:h-31 flex items-center px-10 border-l border-r border-b border-[#d1d1d1] ${
                      isLast ? "rounded-bl-2xl" : ""
                    }`}
                  >
                    <span className="text-base lg:text-2xl font-semibold leading-6 lg:leading-8 tracking-[-0.036px] text-[#171717] whitespace-nowrap">
                      {feature}
                    </span>
                  </div>
                  <div className="flex-1 h-23 lg:h-31 flex items-center justify-center border-r border-b border-[#d1d1d1]">
                    <RedCross />
                  </div>
                  <div
                    className={`flex-1 h-23 lg:h-31 flex items-center justify-center border-r border-b border-[#d1d1d1] ${
                      isLast ? "rounded-br-2xl" : ""
                    }`}
                  >
                    <GreenCheck />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex lg:hidden mt-8.5">
          <div className="w-76 h-2.5 bg-[#e6e6ea] rounded-[99px] px-1 py-0.5">
            <div
              className="h-1.5 w-20 bg-[#8a8b9f] rounded-[99px] transition-transform duration-150"
              style={{
                transform: `translateX(${scrollProgress * maxThumbOffset}px)`,
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyChooseWarmChats;
