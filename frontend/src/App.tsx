import { useScrollReveal } from "@/hooks/useScrollReveal";
import { Hero } from "@/components/homepage/Hero";
import { StatsStrip } from "@/components/homepage/StatsStrip";
import { FeatureSection } from "@/components/homepage/FeatureSection";
import { EnterDashboard } from "@/components/homepage/EnterDashboard";
import { Header } from "@/components/layout/Header";
import { TimingStrip } from "@/components/layout/TimingStrip";
import { RaceDashboard } from "@/pages/RaceDashboard";
import { BoxBoxBanner } from "@/components/engineer/BoxBoxBanner";
import { StatusBanner } from "@/components/ui/StatusBanner";

function App() {
  useScrollReveal();

  return (
    <div className="app" style={{ overflow: "visible" }}>
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
          overflow: "visible",
        }}
      >
        <BoxBoxBanner />
        <Header />
        <TimingStrip />
        <StatusBanner />
        <RaceDashboard />
      </div>
    </div>
  );
}

export default App;
