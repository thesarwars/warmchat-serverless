"use client";

import { useEffect, useState } from "react";
import Navbar from "./Navbar";

const StarIcon = () => (
  <img src="/images/star.svg" alt="" width={24} height={24} />
);

const Banner = () => {
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsStarted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative w-full overflow-hidden">
      <div
        className={`absolute top-4.75 lg:top-7.5 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] lg:w-[calc(100%-56px)] h-215 lg:h-299.25 rounded-2xl lg:rounded-[60px] transition-opacity duration-1000 ease-out ${
          isStarted ? "opacity-100" : "opacity-0"
        }`}
        style={{
          // backgroundImage: "linear-gradient(180deg, rgb(255, 247, 242) 6%, rgb(249, 244, 255) 94%)",
          backgroundImage:
            "linear-gradient(180deg, #FFF7F2 6.48%, #FFF0E8 93.67%)",
        }}
      />

      <div
        className={`absolute top-57.25 left-[14%] w-125 h-180.5 rounded-[200px] bg-white/30 blur-[1px] pointer-events-none animate-float-slow transition-opacity duration-1000 delay-500 hidden lg:block ${
          isStarted ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute -top-70 right-[-2%] w-130.25 h-190.5 rounded-[200px] bg-white/30 blur-[1px] pointer-events-none animate-float-slow-reverse transition-opacity duration-1000 delay-700 hidden lg:block ${
          isStarted ? "opacity-100" : "opacity-0"
        }`}
      />

      <div className="relative z-10 flex flex-col items-center mb-12 lg:mb-24 px-4 sm:px-10 pt-25 lg:pt-42.5 pb-0">
        <Navbar isVisible={isStarted} />

        <div className="flex flex-col items-center gap-6 lg:gap-11 px-4 mt-15 lg:mt-30 max-w-319.5 w-full">
          <div
            className={`flex items-center gap-3 border border-[#ebebeb] rounded-full pl-3.25 pr-4 py-1 transition-all duration-700 ease-out ${
              isStarted
                ? "translate-y-0 opacity-100"
                : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: "400ms" }}
          >
            <div className="flex items-center shrink-0">
              <StarIcon />
              <StarIcon />
              <StarIcon />
              <StarIcon />
              <StarIcon />
            </div>
            <p className="text-[10px] lg:text-xl  font-medium leading-4.5 lg:leading-7.5 text-[#344054]">
              Trusted by agents using Zillow, open houses &amp; Facebook leads
            </p>
          </div>

          <h1 className="text-[30px] lg:text-[60px] font-semibold leading-9.5 lg:leading-18 tracking-[-0.6px] lg:tracking-[-1.2px] text-[#101828] lg:text-[#171717] text-center max-w-319.5">
            <span
              className={`block transition-all duration-700 ease-out ${
                isStarted
                  ? "translate-y-0 opacity-100"
                  : "translate-y-10 opacity-0"
              }`}
              style={{ transitionDelay: "550ms" }}
            >
              Turn New Real Estate Leads Into Booked
            </span>
            <span
              className={`block transition-all duration-700 ease-out ${
                isStarted
                  ? "translate-y-0 opacity-100"
                  : "translate-y-10 opacity-0"
              }`}
              style={{ transitionDelay: "700ms" }}
            >
              Appointments Automatically
            </span>
          </h1>

          <p
            className={`text-base font-normal leading-6 text-[#475467] text-center max-w-242 transition-all duration-700 ease-out ${
              isStarted
                ? "translate-y-0 opacity-100"
                : "translate-y-8 opacity-0"
            }`}
            style={{ transitionDelay: "850ms" }}
          >
            WarmChats instantly responds to new real estate leads, follows up
            24/7, and converts conversations into booked appointments.
          </p>

          <div
            className={`flex flex-col lg:flex-row items-center gap-4 w-full lg:w-auto transition-all duration-700 ease-out ${
              isStarted
                ? "translate-y-0 opacity-100 scale-100"
                : "translate-y-8 opacity-0 scale-95"
            }`}
            style={{ transitionDelay: "1000ms" }}
          >
            <a
              href="/signup"
              className="btn-gradient-hover flex items-center justify-center h-12 lg:h-13 w-full lg:w-auto px-10.5 rounded-full text-sm lg:text-xl font-semibold leading-5 lg:leading-7.5 text-white whitespace-nowrap"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #FB923C 0%, #F97316 50%, #FB923C 100%)",
                backgroundSize: "200% auto",
              }}
            >
              Start Free
            </a>
            <a
              href="https://calendly.com/velasquezjojo7/30min"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center h-12 lg:h-13 w-full lg:w-auto px-10.5 rounded-full bg-white text-sm lg:text-xl font-semibold leading-5 lg:leading-7.5 text-[#171717] whitespace-nowrap transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
            >
              Watch Demo
            </a>
          </div>
        </div>

        <div
          className={`relative mt-12 lg:mt-20 w-full max-w-400 mx-auto transition-all duration-1000 ease-out ${
            isStarted ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0"
          }`}
          style={{ transitionDelay: "1200ms" }}
        >
          <img
            src="/images/dashboard.png"
            alt="WarmChats Dashboard"
            width={13000}
            height={7000}
            className="w-full max-md:px-4 h-50 lg:h-188.25 object-contain rounded-2xl"
          />
          <div className="absolute bottom-0 left-0 w-full h-22.25 lg:h-71.75 bg-linear-to-b from-transparent to-white pointer-events-none blur-0 lg:blur-none" />
        </div>
      </div>
    </section>
  );
};

export default Banner;
