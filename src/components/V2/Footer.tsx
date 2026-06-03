"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const navLinks = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Support", href: "/support" },
  { label: "Get Started", href: "/login" },
  { label: "See It In Action", href: "/waitlist" },
];

const Footer = () => {
  const [isFooterVisible, setIsFooterVisible] = useState(false);
  const footerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = footerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsFooterVisible(true);
          }
        });
      },
      { threshold: 0.15 },
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <footer className="w-full px-1 sm:px-10 pb-4 lg:pb-12 pt-12 lg:pt-0">
      <div
        ref={footerRef}
        className="max-w-480 mx-auto bg-[#0c111d] rounded-2xl overflow-hidden pt-8 lg:pt-16 pb-12 px-4 sm:px-17.5 flex flex-col gap-5 lg:gap-16"
      >
        <div className="flex flex-col lg:flex-row gap-8 justify-between lg:px-8">
          <div
            className={`flex flex-col gap-8 transition-all duration-700 ease-out ${
              isFooterVisible
                ? "translate-y-0 opacity-100"
                : "translate-y-10 opacity-0"
            }`}
          >
            <div className="flex flex-col gap-3 max-w-[320px]">
              <div className="flex items-center gap-2">
                <img src="/icon.png" alt="WarmChats" className="h-16 lg:h-20 2xl:h-24 w-auto object-contain" />
                <span className="text-3xl lg:text-4xl 2xl:text-5xl font-bold tracking-tight text-white">WarmChats</span>
              </div>
              <p className="text-base leading-6 text-[#919fbd]">
                Agents lose 80% of leads to no follow-up. We fix that with AI.
              </p>
            </div>

            <div className="flex items-center gap-4.25 lg:gap-6.25 flex-wrap">
              {navLinks.map((link, i) => (
                <Link
                  key={link.label}
                  to={link.href}
                  className={`text-sm lg:text-base font-medium leading-5.5 lg:leading-6 text-white hover:text-[#F97316] transition-all duration-500 ease-out ${
                    isFooterVisible
                      ? "translate-y-0 opacity-100"
                      : "translate-y-4 opacity-0"
                  }`}
                  style={{ transitionDelay: `${300 + i * 100}ms` }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div
            className={`flex flex-col gap-4 transition-all duration-700 ease-out ${
              isFooterVisible
                ? "translate-y-0 opacity-100"
                : "translate-y-10 opacity-0"
            }`}
            style={{ transitionDelay: "200ms" }}
          >
            <p className="text-base font-medium leading-6 text-white">
              Newsletter
            </p>
            <div className="flex items-center gap-2.5 lg:gap-5">
              <input
                type="email"
                placeholder="Your E-mail Address"
                className="flex-1 lg:w-58.5 bg-[rgba(141,141,141,0.4)] rounded-[66px] px-4 py-3 text-xs lg:text-base font-semibold leading-6 text-white placeholder:text-white/70 outline-hidden focus:ring-1 focus:ring-[#F97316] transition-all duration-300"
              />
              <button
                className="px-4 py-3 rounded-[34px] text-xs lg:text-base font-semibold leading-6 text-white whitespace-nowrap transition-all duration-300 hover:scale-105 hover:shadow-lg active:scale-95 cursor-pointer"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #FB923C 0%, #F97316 86%)",
                }}
              >
                Subscribe Now
              </button>
            </div>
          </div>
        </div>

        <div
          className={`border-t border-[#344054] pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 lg:px-8 transition-all duration-700 ease-out ${
            isFooterVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-6 opacity-0"
          }`}
          style={{ transitionDelay: "400ms" }}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-6">
            <p className="text-base leading-6 text-[#919fbd]">
              ֲ© 2026 WarmChats, Inc. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <Link
                to="/privacy"
                className="text-base leading-6 text-[#919fbd] hover:text-white transition-colors duration-300"
              >
                Privacy Policy
              </Link>
              <Link
                to="/terms"
                className="text-base leading-6 text-[#919fbd] hover:text-white transition-colors duration-300"
              >
                Terms of Use
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://www.facebook.com/profile.php?id=61564736297741&mibextid=wwXIfr"
              target="_blank"
              className="text-[#667085] hover:text-white transition-colors duration-300"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/company/warmchat/"
              target="_blank"
              className="text-[#667085] hover:text-white transition-colors duration-300"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19 3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14m-.5 15.5v-5.3a3.26 3.26 0 00-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 011.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 001.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 00-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
              </svg>
            </a>
            <a
              href="https://www.instagram.com/warmchats_ai"
              target="_blank"
              className="text-[#667085] hover:text-white transition-colors duration-300"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 01-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 017.8 2m-.2 2A3.6 3.6 0 004 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 003.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5M12 7a5 5 0 110 10 5 5 0 010-10m0 2a3 3 0 100 6 3 3 0 000-6z" />
              </svg>
            </a>
            <a
              href="https://x.com/warmchats_ai?s=21"
              target="_blank"
              className="text-[#667085] hover:text-white transition-colors duration-300"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://youtube.com/@warmchats?si=NX9JvDpl29ztwif-"
              target="_blank"
              className="text-[#667085] hover:text-white transition-colors duration-300"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z" />
              </svg>
            </a>
          </div>
        </div>

        <div
          className={`overflow-hidden transition-all duration-1000 pt-7 pb-7 md:pb-12 ease-out ${
            isFooterVisible ? "opacity-100" : "opacity-0"
          }`}
          style={{ transitionDelay: "700ms" }}
        >
          <div className=" text-center">
            <img
              src="/images/WarmChats.webp"
              alt="WarmChats"
              width={1200}
              height={700}
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
