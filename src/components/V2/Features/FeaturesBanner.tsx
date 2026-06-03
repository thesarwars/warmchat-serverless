import Navbar from "@/components/V2/Navbar";
import { useEffect, useState } from "react";

const FeaturesBanner = () => {
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsStarted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative w-full">
      <div className="absolute inset-x-0 top-4.75 lg:top-7.5 h-100 lg:h-141.5 flex justify-center overflow-hidden px-4 lg:px-0">
        <div
          className="w-full max-w-466.25 h-full rounded-2xl lg:rounded-[60px]"
          style={{
            backgroundImage:
              "linear-gradient(180deg, #fff7f2 6.5%, #fff0e8 93.7%)",
          }}
        />
      </div>

      <div className="absolute -left-25 top-5 w-130.25 h-190.5 items-center justify-center pointer-events-none hidden lg:flex">
        <div className="rotate-[21.75deg] skew-x-[-5.75deg]">
          <div className="w-42.5 h-197 bg-linear-to-b from-transparent via-white/45 to-transparent" />
        </div>
      </div>
      <div className="absolute -right-25 -top-50 w-125 h-180.5 items-center justify-center pointer-events-none hidden lg:flex">
        <div className="rotate-[21.75deg] skew-x-[-5.75deg]">
          <div className="w-42.5 h-185.75 bg-linear-to-b from-transparent via-white/45 to-transparent" />
        </div>
      </div>

      <div className="relative z-1 flex flex-col items-center px-4 sm:px-10">
        <Navbar isVisible={isStarted} />

        <div className="flex flex-col items-center gap-3 px-2 mt-35 lg:mt-62.5 max-w-254.5 mx-auto">
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
            <span className="font-semibold leading-4.5 tracking-[0.024px] bg-linear-to-r from-[#FB923C] to-[#F97316] bg-clip-text text-xl text-transparent">
              Feature-Rich Platform
            </span>
          </div>

          <h1
            className={`text-[30px] lg:text-[60px] font-semibold leading-9.5 lg:leading-18 tracking-[-0.6px] lg:tracking-[-1.2px] text-[#171717] text-center transition-all duration-700 ease-out ${
              isStarted
                ? "translate-y-0 opacity-100"
                : "translate-y-10 opacity-0"
            }`}
            style={{ transitionDelay: "550ms" }}
          >
            Powerful Features Built for Smart Outreach
          </h1>

          <p
            className={`text-base leading-6 text-[#475467] text-center max-w-160.25 mt-3 transition-all duration-700 ease-out ${
              isStarted
                ? "translate-y-0 opacity-100"
                : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: "700ms" }}
          >
            Everything you need to create, automate, and optimize
            high-performing automations.
          </p>
        </div>
      </div>

      <div className="h-30 lg:h-32.5" />
    </section>
  );
};

export default FeaturesBanner;
