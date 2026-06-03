"use client";

import { useCallback, useState } from "react";

interface FeatureCard {
  icon: string;
  title: string;
  description: string;
  highlighted?: boolean;
  category: string;
}

const features: FeatureCard[] = [
  {
    icon: "/images/icon-more-square.svg",
    title: "Fast AI Message Generation",
    description:
      "Generate messages quickly with context-aware AI that writes human-like, personalized outreach.",
    highlighted: true,
    category: "AI Creation",
  },
  {
    icon: "/images/icon-bolt.svg",
    title: "Custom Templates",
    description:
      "Create reusable templates to streamline outreach and maintain consistency across automations.",
      highlighted: true,
      category: "AI Creation",
  },
  {
    icon: "/images/icon-bolt.svg",
    title: "AI Personalization",
    description:
      "Automatically add personal details and context for authentic, engaging messages.",
      highlighted: true,
      category: "AI Creation",
  },
  {
    icon: "/images/icon-chat-bubbles.svg",
    title: "Automated Follow-Ups",
    description:
      "Set up smart follow-up sequences that trigger automatically, so no lead ever slips through the cracks.",
    highlighted: true,
    category: "Automation",
  },
  {
    icon: "/images/icon-mobile-prog.svg",
    title: "Built-In CRM & Beyond",
    description:
      "Manage contacts, track deals, and run outreach - all in one place, without stitching together separate tools.",
    highlighted: true,
    category: "Automation",
  },
  {
    icon: "/images/icon-more-square.svg",
    title: "Send at the Right Moment",
    description:
      "Every contact gets your message when they're most likely to respond - guided by timezone, behavior, and past engagement.",
    highlighted: true,
    category: "Automation",
  },
  {
    icon: "/images/icon-sent.svg",
    title: "Delivery & Open Tracking",
    description:
      "See exactly when messages are delivered, opened, and read - in real time, across every channel.",
    highlighted: true,
    category: "Analytics",
  },
  {
    icon: "/images/icon-chat-bubbles.svg",
    title: "Conversation Insights",
    description:
      "Understand what's working with reply rates, sentiment trends, and engagement breakdowns per automation.",
    highlighted: true,
    category: "Analytics",
  },
  {
    icon: "/images/icon-bolt.svg",
    title: "A/B Testing",
    description:
      "Test different message variants simultaneously and let the data surface which copy drives the most replies.",
    highlighted: true,
    category: "Analytics",
  },
  {
    icon: "/images/icon-mobile-prog.svg",
    title: "Shared Team Inbox",
    description:
      "Keep your whole team aligned with a unified inbox where anyone can pick up a conversation seamlessly.",
    highlighted: true,
    category: "Collaboration",
  },
  {
    icon: "/images/icon-sent.svg",
    title: "Automation Co-Authoring",
    description:
      "Draft, review, and approve outreach automations together - with comments, version history, and role-based access.",
    highlighted: true,
    category: "Collaboration",
  },
  {
    icon: "/images/icon-chat-bubbles.svg",
    title: "Permission & Role Management",
    description:
      "Control exactly who can view, edit, or send automations with granular team permissions and audit logs.",
    highlighted: true,
    category: "Collaboration",
  },
];

const tabs = ["All", "AI Creation", "Automation", "Analytics", "Collaboration"];

const AIFeatures = () => {
  const [activeTab, setActiveTab] = useState("All");
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
      { threshold: 0.1 },
    );
    root
      .querySelectorAll<HTMLElement>("[data-vis-key]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const isVisible = (key: string) => visibleSections.has(key);

  const filtered =
    activeTab === "All"
      ? features
      : features.filter((f) => f.category === activeTab);

  const handleTabChange = (tab: string) => {
    if (tab === activeTab) return;
    setIsAnimating(true);
    setTimeout(() => {
      setActiveTab(tab);
      setIsAnimating(false);
    }, 250);
  };

  return (
    <section className="w-full bg-white pt-20 pb-15 px-4 sm:px-10">
      <div
        ref={observeRoot}
        className="max-w-400 mx-auto flex flex-col items-center gap-14"
      >
        <div
          data-vis-key="ai-tabs"
          className={`flex items-center gap-3 flex-wrap justify-center transition-all duration-700 ease-out ${
            isVisible("ai-tabs")
              ? "translate-y-0 opacity-100"
              : "translate-y-6 opacity-0"
          }`}
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-5 py-1.5 rounded-full text-sm font-medium leading-5.5 border transition-all duration-300 cursor-pointer ${
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

        <div
          data-vis-key="ai-cards"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 w-full"
        >
          {filtered.map((card, i) => (
            <div
              key={`${card.title}-${i}`}
              className={`flex flex-col gap-6 rounded-xl transition-all duration-500 ease-out hover:shadow-lg hover:-translate-y-1 ${
                card.highlighted
                  ? "px-6 py-8 rounded-xl"
                  : "bg-white border border-[#ebebeb] p-10 rounded-2xl"
              } ${
                isAnimating
                  ? "translate-y-4 opacity-0"
                  : isVisible("ai-cards")
                    ? "translate-y-0 opacity-100"
                    : "translate-y-14 opacity-0"
              }`}
              style={{
                transitionDelay: isAnimating ? "0ms" : `${i * 100}ms`,
                ...(card.highlighted
                  ? {
                      backgroundImage:
                        "linear-gradient(180deg, #fff7f2 6.5%, #fff0e8 93.7%)",
                      padding: "32px 24px",
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

              <div className="flex flex-col gap-6">
                <h3 className="text-xl font-medium leading-7.5 text-[#171717]">
                  {card.title}
                </h3>
                <p className="text-sm leading-5.5 text-[#5c5c5c]">
                  {card.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AIFeatures;
