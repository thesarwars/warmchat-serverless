import React, { useEffect } from "react";
import Footer from "../components/V2/Footer";
// import Sidebar from "@/components/SideBar";
// import { useNavigate } from "react-router-dom";
import Banner from "@/components/V2/Banner";
import KeyHighlights from "@/components/V2/KeyHighlights";
import BookAppointments from "@/components/V2/BookAppointments";
import PricingPlan from "@/components/V2/PricingPlan";
import SendMessages from "@/components/V2/SendMessages";
import AutoBooking from "@/components/V2/AutoBooking";
import BuiltWithAgents from "@/components/V2/BuiltWithAgents";
import TryItOn from "@/components/V2/TryItOn";
import HowItWorks from "@/components/V2/HowItWorks";

const Index: React.FC = () => {
  // const navigate = useNavigate();
  useEffect(() => {
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (e) => {
        e.preventDefault();
        const targetId = (anchor as HTMLAnchorElement).getAttribute("href")?.substring(1);
        if (!targetId) return;

        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          window.scrollTo({
            top: targetElement.offsetTop - 80, // Adjust for navbar height
            behavior: "smooth",
          });
        }
      });
    });

    // document.title = "WarmChats - Compliant Outreach with AI";
  }, []);

  return (
    <main className="font-jakarta overflow-x-hidden bg-white">
      <Banner />
      <KeyHighlights />
      <BookAppointments />
      <SendMessages />
      <HowItWorks />
      <PricingPlan />
      <AutoBooking />
      <BuiltWithAgents />
      <TryItOn />
      <Footer />
    </main>
  );
};

export default Index;
