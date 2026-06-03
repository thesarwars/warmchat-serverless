"use client";

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthSession } from "@/hooks/useAuthSession";

type NavLink = { label: string; href: string };

const HamburgerButton = ({
  className = "",
  onOpen,
}: {
  className?: string;
  onOpen: () => void;
}) => (
  <button
    onClick={onOpen}
    className={`xl:hidden flex flex-col justify-center items-center w-6 h-6 gap-1.25 cursor-pointer ${className}`}
    aria-label="Open menu"
  >
    <span className="w-5 h-0.5 bg-[#171717] rounded-full" />
    <span className="w-5 h-0.5 bg-[#171717] rounded-full" />
    <span className="w-3.5 h-0.5 bg-[#171717] rounded-full self-start ml-0.5" />
  </button>
);

const DesktopLinks = ({
  navLinks,
  pathname,
  isVisible,
}: {
  navLinks: NavLink[];
  pathname: string;
  isVisible: boolean;
}) => (
  <ul className="hidden xl:flex items-center gap-6.25 ml-auto mr-auto">
    {navLinks.map((link, i) => (
      <li key={link.label}>
        <Link
          to={link.href || "#"}
            className={`text-base font-medium leading-6 whitespace-nowrap transition-all duration-500 ease-out ${
            link.href && link.href === pathname
              ? "text-[#F97316]"
              : "text-[#101828] hover:text-[#F97316] duration-100"
          } hover:opacity-80 ${
            isVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-3 opacity-0"
          }`}
          style={{ transitionDelay: `${300 + i * 80}ms` }}
        >
          {link.label}
        </Link>
      </li>
    ))}
  </ul>
);

const DesktopButtons = ({
  ctaHref,
  ctaLabel,
  isVisible,
}: {
  ctaHref: string;
  ctaLabel: string;
  isVisible: boolean;
}) => (
  <div className="hidden xl:flex items-center gap-6 shrink-0">
    <Link
      to={ctaHref}
      className={`btn-gradient-hover flex items-center justify-center 2xl:h-13 h-10 2xl:px-10.5 px-8 rounded-full 2xl:text-xl text-base font-semibold leading-7.5 text-white whitespace-nowrap ${
        isVisible
          ? "translate-y-0 opacity-100 scale-100"
          : "translate-y-3 opacity-0 scale-95"
      }`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, #FB923C 0%, #F97316 50%, #EA6D0C 100%)",
        backgroundSize: "200% auto",
        transitionDelay: isVisible ? "0ms" : "600ms",
      }}
    >
      {ctaLabel}
    </Link>
    <a
      href="/waitlist"
      className={`btn-outline-hover relative flex items-center justify-center 2xl:h-13 h-10 2xl:px-10.5 px-8 rounded-full border border-[#F97316] 2xl:text-xl text-base font-semibold leading-7.5 whitespace-nowrap ${
        isVisible ? " opacity-100 " : " opacity-0 "
      }`}
      style={{ transitionDelay: isVisible ? "0ms" : "700ms" }}
    >
      <span className="btn-label transition-opacity duration-300">
        Get a Demo
      </span>
      <span className="btn-label-hover absolute inset-0 flex items-center justify-center text-white opacity-0 transition-opacity duration-300">
        Get a Demo
      </span>
    </a>
  </div>
);

const Navbar = ({ isVisible }: { isVisible: boolean }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const session = useAuthSession();
  const isLoggedIn = Boolean(session.token);
  const ctaHref = isLoggedIn ? "/dashboard" : "/login";
  const ctaLabel = isLoggedIn ? "Dashboard" : "Login";

  // Public nav links stay lightweight; the primary CTA handles login/dashboard.
  const navLinks: NavLink[] = [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Get Started", href: ctaHref },
    { label: "See It In Action", href: "/waitlist" },
  ];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  const openMobile = () => setIsMobileOpen(true);

  return (
    <>
      <nav
        className={`flex items-center fixed left-5.5 right-5.5 z-50 bg-white rounded-2xl md:rounded-[56px] px-4 lg:px-7 2xl:px-15 py-4  gap-6 mx-auto transition-all duration-500 ease-out ${
          isVisible ? "translate-y-0 opacity-100" : "-translate-y-8 opacity-0"
        } ${isScrolled ? "hidden" : "top-6 lg:top-12 2xl:top-20 max-w-[92%] lg:max-w-[90%] 2xl:max-w-319.5"}`}
      >
        <Link
          to="/"
          className={`shrink-0 transition-all duration-500 delay-200 ease-out ${
            isVisible ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"
          }`}
        >
          <div className="flex items-center gap-2">
            <img src="/icon.png" alt="WarmChats" className="h-10 lg:h-12 2xl:h-14 w-auto object-contain" />
            <span className="text-base lg:text-lg 2xl:text-xl font-bold tracking-tight text-[#101828]">WarmChats</span>
          </div>
        </Link>

        <DesktopLinks navLinks={navLinks} pathname={pathname} isVisible={isVisible} />
        <DesktopButtons ctaHref={ctaHref} ctaLabel={ctaLabel} isVisible={isVisible} />
        <HamburgerButton className="ml-auto" onOpen={openMobile} />
      </nav>

      <nav
        className={`flex items-center fixed left-0 top-0 right-0 z-50 bg-white  px-5 lg:px-7 2xl:px-15 py-5 lg:py-5 gap-6 mx-auto transition-all duration-500 ease-out ${
          isScrolled ? "translate-y-0 opacity-100" : "-translate-y-8 opacity-0"
        }`}
      >
        <Link
          to="/"
          className={`shrink-0 transition-all duration-500 delay-200 ease-out ${
            isVisible ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"
          }`}
        >
          <div className="flex items-center gap-2">
            <img src="/icon.png" alt="WarmChats" className="h-10 lg:h-12 2xl:h-14 w-auto object-contain" />
            <span className="text-base lg:text-lg 2xl:text-xl font-bold tracking-tight text-[#101828]">WarmChats</span>
          </div>
        </Link>

        <DesktopLinks navLinks={navLinks} pathname={pathname} isVisible={isVisible} />
        <DesktopButtons ctaHref={ctaHref} ctaLabel={ctaLabel} isVisible={isVisible} />
        <HamburgerButton className="ml-auto" onOpen={openMobile} />
      </nav>

      <div
        className={`xl:hidden fixed inset-0 bg-black/40 transition-opacity duration-300 ${
          isMobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        style={{
          zIndex: 100
        }}
        onClick={() => setIsMobileOpen(false)}
      />

      <div
        className={`xl:hidden fixed top-0 right-0 h-full w-full max-w-100 bg-white transition-transform duration-400 ease-out ${
          isMobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          zIndex: 101
        }}
      >
        <div className="flex flex-col h-full px-6 pt-9.5 pb-10">
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-2">
              <img src="/icon.png" alt="WarmChats" className="h-10 w-auto object-contain" />
              <span className="text-lg font-bold tracking-tight text-[#101828]">WarmChats</span>
            </div>
            <button
              onClick={() => setIsMobileOpen(false)}
              className="w-6 h-6 flex items-center justify-center cursor-pointer"
              aria-label="Close menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="#171717"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-6.25">
            {navLinks
              .filter((l) => l.label !== "Home")
              .map((link, i) => (
                <Link
                  key={link.label}
                  to={link.href || "#"}
                  onClick={() => setIsMobileOpen(false)}
                  className={`text-base font-medium leading-6 text-center transition-all duration-400 ease-out ${
                    link.href && link.href === pathname
                      ? " text-[#F97316]"
                      : "text-[#101828]"
                  } ${
                    isMobileOpen
                      ? "translate-y-0 opacity-100"
                      : "translate-y-4 opacity-0"
                  }`}
                  style={{ transitionDelay: `${150 + i * 80}ms` }}
                >
                  {link.label}
                </Link>
              ))}
          </div>

          <div className="flex flex-col gap-4 mt-auto">
            <a
              href={ctaHref}
              className={`flex items-center justify-center h-12 w-full rounded-full text-sm font-semibold leading-5 text-white transition-all duration-400 ease-out ${
                isMobileOpen
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }`}
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #FB923C 0%, #F97316 86%)",
                transitionDelay: "400ms",
              }}
              onClick={() => setIsMobileOpen(false)}
            >
              {isLoggedIn ? "Dashboard" : "Start Free"}
            </a>
            <a
              href="/waitlist"
              className={`flex items-center justify-center h-12 w-full rounded-full border border-[#F97316] text-sm font-semibold leading-5 text-[#F97316] transition-all duration-400 ease-out ${
                isMobileOpen
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }`}
              style={{ transitionDelay: "480ms" }}
              onClick={() => setIsMobileOpen(false)}
            >
              Watch Demo
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
