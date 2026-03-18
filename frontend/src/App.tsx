import { useScrollReveal } from "@/hooks/useScrollReveal";
import { Hero } from "@/components/homepage/Hero";
import { StatsStrip } from "@/components/homepage/StatsStrip";
import { FeatureSection } from "@/components/homepage/FeatureSection";
import { EnterDashboard } from "@/components/homepage/EnterDashboard";
import { Header } from "@/components/layout/Header";
import { RaceDashboard } from "@/pages/RaceDashboard";
import { BoxBoxBanner } from "@/components/engineer/BoxBoxBanner";

function App() {
  useScrollReveal();

  return (
    <div className="app">
      <Hero />
      <StatsStrip />
      <FeatureSection />
      <EnterDashboard />

      <div
        id="dashboard"
        className="min-h-screen flex flex-col"
        style={{
          scrollMarginTop: 0,
          background: "var(--dash-bg)",
          position: "relative",
        }}
      >
        <BoxBoxBanner />
        <Header />
        <RaceDashboard />
      </div>
    </div>
  );
}

export default App;
