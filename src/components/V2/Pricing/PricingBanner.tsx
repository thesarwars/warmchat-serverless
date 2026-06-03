import Navbar from "@/components/V2/Navbar";
import { useEffect, useState } from "react";

const PricingBanner = () => {
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsStarted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative w-full">
      <div className="absolute inset-x-0 top-4 lg:top-7.5 h-107.25 lg:h-169 flex justify-center overflow-hidden px-4 lg:px-0">
        <div
          className="w-full max-w-466.25 h-full rounded-2xl lg:rounded-[60px]"
          style={{
            backgroundImage:
              "linear-gradient(180deg, #fff7f2 6.5%, #fff0e8 93.7%)",
          }}
        />
      </div>

      <div className="absolute -left-12.5 -top-58.75 w-166.5 h-171.75 items-center justify-center pointer-events-none hidden lg:flex">
        <div className="rotate-[129.05deg] skew-x-[-5.75deg]">
          <div className="w-42.5 h-197 bg-linear-to-b from-transparent via-white/45 to-transparent" />
        </div>
      </div>
      <div className="absolute -right-12.5 -top-25.75 w-181.5 h-135.5 items-center justify-center pointer-events-none hidden lg:flex">
        <div className="rotate-[50.67deg] skew-x-[-5.75deg]">
          <div className="w-42.5 h-185.75 bg-linear-to-b from-transparent via-white/45 to-transparent" />
        </div>
      </div>

      <div className="relative z-1 flex flex-col items-center px-4 sm:px-10">
        <Navbar isVisible={isStarted} />

        <div className="flex flex-col items-center gap-3.5 lg:gap-3 mt-35 lg:mt-62.5 max-w-254.5 mx-auto">
          <div
            className={`flex items-center gap-1.5 px-3 py-1 transition-all duration-700 ease-out ${
              isStarted
                ? "translate-y-0 opacity-100"
                : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: "400ms" }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #FB923C 0%, #F97316 86%)",
              }}
            />
            <span className="text-xs font-semibold leading-4.5 tracking-[0.024px] text-[#F97316]">
              Simple, Transparent Pricing
            </span>
          </div>

          <h1
            className={`text-[30px] lg:text-[60px] font-semibold leading-9.5 lg:leading-18 tracking-[-0.6px] lg:tracking-[-1.2px] text-[#101828] text-center transition-all duration-700 ease-out ${
              isStarted
                ? "translate-y-0 opacity-100"
                : "translate-y-10 opacity-0"
            }`}
            style={{ transitionDelay: "550ms" }}
          >
            Plans Built To Close More Deals Automatically
          </h1>

          <p
            className={`text-base leading-6 px-3 text-[#475467] text-center max-w-160.25 transition-all duration-700 ease-out ${
              isStarted
                ? "translate-y-0 opacity-100"
                : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: "700ms" }}
          >
            {`Whether you're a solo agent or a growing team, WarmChats helps you respond faster, follow up smarter, and convert more leads.`}
          </p>
        </div>
      </div>

      <div className="h-30 lg:h-62.5" />
    </section>
  );
};

export default PricingBanner;
