import FeaturesBanner from "./FeaturesBanner";
import AIFeatures from "./AIFeatures";
import BuiltWithAgents from "@/components/V2/BuiltWithAgents";
import TryItOn from "@/components/V2/TryItOn";
import Footer from "@/components/V2/Footer";

const Features = () => {
  return (
    <div className="font-jakarta overflow-x-hidden bg-white">
      <FeaturesBanner />
      <AIFeatures />
      <BuiltWithAgents />
      <TryItOn />
      <Footer />
    </div>
  );
};

export default Features;
