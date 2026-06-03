import React from "react";
import MainLayout from "../components/MainLayout";
import SupportContent from "./SupportContent";

const DashboardSupport: React.FC = () => {
  return (
    <MainLayout title="Support">
      <div className="px-5 py-8">
        <SupportContent />
      </div>
    </MainLayout>
  );
};

export default DashboardSupport;
