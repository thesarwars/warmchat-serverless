import React, { useEffect, useState } from "react";
import Footer from "@/components/V2/Footer";
import Navbar from "../components/V2/Navbar";
import SupportContent from "./SupportContent";

const Support: React.FC = () => {
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsStarted(true), 100);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar isVisible={isStarted} />
      <main className="bg-[#fffafd] px-5 pt-35 lg:pt-47.5">
        <SupportContent />
      </main>
      <Footer />
    </div>
  );
};

export default Support;
