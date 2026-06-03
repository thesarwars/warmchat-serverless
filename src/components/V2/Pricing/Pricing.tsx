import PricingBanner from "./PricingBanner";
import WhyChooseWarmChats from "./WhyChooseWarmChats";
import TryItOn from "@/components/V2/TryItOn";
import Footer from "@/components/V2/Footer";
import PricingPlan from "../PricingPlan";

const Pricing = () => {
  return (
    <div className="font-jakarta overflow-x-hidden bg-white">
      <PricingBanner />
      <PricingPlan />
      <WhyChooseWarmChats />
      <TryItOn />
      <Footer />
    </div>
  );
};

export default Pricing;
