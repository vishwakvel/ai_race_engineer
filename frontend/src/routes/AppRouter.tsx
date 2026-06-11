import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LandingPage } from "@/components/landing/LandingPage";
import { TimingStrip } from "@/components/layout/TimingStrip";
import { BoxBoxBanner } from "@/components/engineer/BoxBoxBanner";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRaceUrlSync } from "@/routes/useRaceUrlSync";

const RaceDashboard = lazy(() =>
  import("@/pages/RaceDashboard").then((m) => ({ default: m.RaceDashboard }))
);

function PitWallSession() {
  useRaceUrlSync();

  return (
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
      <TimingStrip />
      <StatusBanner />
      <Suspense
        fallback={
          <div className="p-8">
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <RaceDashboard />
      </Suspense>
    </div>
  );
}

function HomePage() {
  return (
    <>
      <a href="#dashboard" className="skip-link">
        Skip to pit wall
      </a>
      <LandingPage dashboard={<PitWallSession />} />
    </>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/race/:year/:round" element={<HomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
