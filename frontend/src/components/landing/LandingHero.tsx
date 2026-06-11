import { PitWallButton } from "@/components/landing/PitWallButton";

const HERO_IMAGE = "/eyes.jpg";

function scrollToDashboard() {
  document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" });
}

export function LandingHero() {
  return (
    <section
      id="hero-section"
      className="landing-section"
      data-landing-section="hero"
      aria-label="Hero"
    >
      <div className="hero-grid">
        <p className="hero-copy">Your race engineer. Always in your ear.</p>

        <div className="hero-image-wrap">
          <img
            src={HERO_IMAGE}
            alt="Charles Leclerc — intense focus through the Ferrari helmet visor"
            loading="eager"
            decoding="async"
          />
        </div>

        <div className="hero-cta-wrap">
          <PitWallButton onNavigate={scrollToDashboard} />
        </div>
      </div>
    </section>
  );
}
