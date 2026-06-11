import { useEffect, useState, type ReactNode } from "react";
import { IntroSplash } from "@/components/landing/IntroSplash";
import { LandingHero } from "@/components/landing/LandingHero";
import { AboutSection } from "@/components/landing/AboutSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { LandingCursor } from "@/components/landing/LandingCursor";
import { useLandingScroll } from "@/hooks/useLandingScroll";
import { useMotionSafe } from "@/hooks/useMotionSafe";

interface LandingPageProps {
  dashboard: ReactNode;
}

export function LandingPage({ dashboard }: LandingPageProps) {
  const motionOk = useMotionSafe();
  const [splashDone, setSplashDone] = useState(!motionOk);

  useEffect(() => {
    if (!splashDone) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    document.body.style.overflow = "";
  }, [splashDone]);

  useLandingScroll({ enabled: splashDone, motionOk });

  return (
    <>
      {!splashDone && (
        <IntroSplash onComplete={() => setSplashDone(true)} motionOk={motionOk} />
      )}

      <LandingCursor active={splashDone && motionOk} />

      {splashDone && (
        <div className="landing-logo" data-landing-logo aria-hidden="true">
          LECLERCAI
        </div>
      )}

      <LandingHero />
      <AboutSection />
      <HowItWorksSection />

      <div className="dashboard-enter landing-section--dashboard">{dashboard}</div>
    </>
  );
}
