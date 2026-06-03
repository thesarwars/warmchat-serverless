"use client";

import { useCallback, useState } from "react";

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  image: string;
  category: string;
}

const testimonials: Testimonial[] = [
  {
    quote: "Speed is everything with internet leads. Before WarmChats, I'd respond 20-30 minutes later and the lead was already talking to another agent. Now my leads get a response instantly and I'm the first person they talk to. That alone has made a huge difference.",
    name: "Vanessa Gomez | New Agent",
    role: "Compass, New York",
    image: "/images/vanessa.png",
    category: "New Agent",
  },
  {
    quote:
      "I get a lot of online leads from Zillow and my website, but I wasn't always able to respond right away. By the time I got back to them, many were already working with another agent. WarmChats changed that. Now every lead gets an instant response and the system keeps the conversation going until they're ready to schedule a showing.",
    name: "Lucas Clarke | Active Agent",
    role: "Keller Williams, Salt Lake City",
    image: "/images/clark.png",
    category: "Active Agent",
  },
  {
    quote:
      "Speed to lead is everything in this business. If you're not the first agent to respond, you usually lose the opportunity. WarmChats makes sure every new inquiry gets an immediate response and stays engaged until we can take over the conversation. It's been a great tool for managing a high volume of leads.",
    name: "Tyler Smith | Team Leader",
    role: "Exp Realty, San Jose CA",
    image: "/images/smith.png",
    category: "Team Leader",
  },
];

const tabs = ["New Agent", "Active Agent", "Team Leader"];

const BuiltWithAgents = () => {
  const [activeTab, setActiveTab] = useState("New Agent");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
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

  const filtered = testimonials.filter((t) => t.category === activeTab);
  const current = filtered[currentIndex] || filtered[0];

  const handleTabChange = (tab: string) => {
    if (tab === activeTab) return;
    setIsAnimating(true);
    setTimeout(() => {
      setActiveTab(tab);
      setCurrentIndex(0);
      setIsAnimating(false);
    }, 300);
  };

  const handleNext = () => {
    setIsAnimating(true);
    setTimeout(() => {
      if (activeTab === "New Agent") {
        setActiveTab("Active Agent");
      } else if (activeTab === "Active Agent") {
        setActiveTab("Team Leader");
      } else {
        setActiveTab("New Agent");
      }
      setCurrentIndex(0);
      setIsAnimating(false);
    }, 300);
  };

  const handlePrev = () => {
    setIsAnimating(true);
    setTimeout(() => {
      if (activeTab === "New Agent") {
        setActiveTab("Team Leader");
      } else if (activeTab === "Active Agent") {
        setActiveTab("New Agent");
      } else {
        setActiveTab("Active Agent");
      }
      setCurrentIndex(0);
      setIsAnimating(false);
    }, 300);
  };

  return (
    <section className="w-full bg-white py-2.5 lg:pt-20 lg:pb-15 px-4 sm:px-10">
      <div
        ref={observeRoot}
        className="max-w-400 mx-auto flex flex-col items-center gap-10 lg:gap-12"
      >
        <div
          data-vis-key="agents-header"
          className="flex flex-col items-center gap-6 lg:gap-6 w-full"
        >
          <div className="flex flex-col items-center lg:items-center gap-5 lg:gap-6 max-w-209.75 mx-auto w-full">
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={`flex items-center gap-1.5 px-3 py-1 transition-all duration-700 ease-out ${
                  isVisible("agents-header")
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
                  Testimonials
                </span>
              </div>

              <h2
                className={`text-2xl lg:text-5xl font-medium leading-8 lg:leading-15 tracking-[-0.036px] lg:tracking-[-0.96px] text-[#171717] text-center transition-all duration-700 ease-out ${
                  isVisible("agents-header")
                    ? "translate-y-0 opacity-100"
                    : "translate-y-8 opacity-0"
                }`}
                style={{ transitionDelay: "150ms" }}
              >
                Built With Real Estate Agents
              </h2>
            </div>

            <p
              className={`text-base leading-6 text-[#5c5c5c] text-left lg:text-center max-w-194.5 transition-all duration-700 ease-out ${
                isVisible("agents-header")
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }`}
              style={{ transitionDelay: "300ms" }}
            >
              Real estate agents use WarmChats to instantly reply, follow up
              smarter and book more appointments automatically.
            </p>
          </div>

          <div
            className={`flex items-center gap-3 overflow-x-auto w-full lg:w-auto lg:justify-center transition-all duration-700 ease-out ${
              isVisible("agents-header")
                ? "translate-y-0 opacity-100"
                : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: "450ms" }}
          >
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-5 py-1.5 rounded-full text-sm font-medium leading-5.5 border transition-all duration-300 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === tab
                    ? "border-[#F97316] text-white"
                    : "border-[#a3a3a3] text-[#585858] hover:border-[#F97316] hover:text-[#F97316]"
                }`}
                style={
                  activeTab === tab
                    ? {
                        backgroundImage:
                          "linear-gradient(90deg, #FB923C 0%, #F97316 86%)",
                      }
                    : {}
                }
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div
          data-vis-key="agents-card"
          className={`relative w-full transition-all duration-700 ease-out ${
            isVisible("agents-card")
              ? "translate-y-0 opacity-100"
              : "translate-y-14 opacity-0"
          }`}
        >
          <div className="relative flex flex-col lg:flex-row items-center lg:items-stretch">
            {/* Desktop profile image */}
            <div className="hidden lg:block relative z-50 shrink-0 w-75 xl:w-90.5">
              <div
                className={`w-75 h-75 xl:w-90.5 xl:h-90.5 rounded-full overflow-hidden transition-all duration-500 ease-out ${
                  isAnimating ? "scale-95 opacity-0" : "scale-100 opacity-100"
                }`}
              >
                <img
                  src={current.image}
                  alt={current.name}
                  width={3000}
                  height={3000}
                  className="w-full h-full object-cover scale-125 object-center relative z-50"
                />
              </div>
            </div>

            {/* Mobile profile image (overlapping) */}
            <div
              className={`lg:hidden relative z-50 w-59.75 h-59.75 rounded-full overflow-hidden -mb-25 transition-all duration-500 ease-out ${
                isAnimating ? "scale-95 opacity-0" : "scale-100 opacity-100"
              }`}
            >
              <img
                src={current.image}
                alt={current.name}
                width={470}
                height={478}
                className="w-full h-full object-cover scale-125 object-center"
              />
            </div>

            <div
              className={`flex-1 bg-[#fbfaf9] rounded-xl lg:rounded-[60px] pt-30 lg:pt-0 py-15.25 px-4 lg:pl-25 xl:pl-49.25 lg:pr-17 lg:-ml-25 xl:-ml-40 flex flex-col gap-7 items-center lg:items-start justify-center text-center lg:text-left transition-all duration-500 ease-out ${
                isAnimating
                  ? "translate-x-4 opacity-0"
                  : "translate-x-0 opacity-100"
              }`}
            >
              <p className="text-xl lg:text-[30px] font-medium leading-7.5 lg:leading-9.5 tracking-[-0.06px] text-[#171717]">
                {current.quote}
              </p>

              <div className="flex flex-col items-center lg:items-start gap-2">
                <p className="text-base lg:text-2xl font-medium lg:font-semibold leading-6 lg:leading-8 tracking-[-0.036px] text-[#171717]">
                  {current.name}
                </p>
                <p className="text-sm lg:text-base leading-5.5 lg:leading-6 text-[#5c5c5c]">
                  {current.role}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`flex items-center gap-2.5 transition-all duration-700 ease-out ${
            isVisible("agents-card")
              ? "translate-y-0 opacity-100"
              : "translate-y-6 opacity-0"
          }`}
          style={{ transitionDelay: "300ms" }}
        >
          <button
            onClick={handlePrev}
            className="w-12 h-12 lg:w-15.5 lg:h-15.5 rounded-full bg-[#f6f6f6] flex items-center justify-center transition-all duration-300 hover:bg-[#eaeaea] hover:scale-105 active:scale-95 cursor-pointer"
          >
            <svg
              width="13"
              height="26"
              viewBox="0 0 16 32"
              fill="none"
              className="rotate-180"
            >
              <path
                d="M3.3 8.87L4.73 7.44L12.52 15.23C12.65 15.35 12.75 15.5 12.82 15.66C12.89 15.83 12.92 16 12.92 16.18C12.92 16.36 12.89 16.53 12.82 16.69C12.75 16.86 12.65 17.01 12.52 17.13L4.73 24.92L3.3 23.49L10.61 16.18L3.3 8.87Z"
                fill="black"
              />
            </svg>
          </button>
          <button
            onClick={handleNext}
            className="w-12 h-12 lg:w-15.5 lg:h-15.5 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #FB923C 0%, #F97316 86%)",
            }}
          >
            <svg width="13" height="26" viewBox="0 0 16 32" fill="none">
              <path
                d="M3.3 8.87L4.73 7.44L12.52 15.23C12.65 15.35 12.75 15.5 12.82 15.66C12.89 15.83 12.92 16 12.92 16.18C12.92 16.36 12.89 16.53 12.82 16.69C12.75 16.86 12.65 17.01 12.52 17.13L4.73 24.92L3.3 23.49L10.61 16.18L3.3 8.87Z"
                fill="white"
              />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
};

export default BuiltWithAgents;
