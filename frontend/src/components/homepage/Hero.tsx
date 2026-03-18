function scrollToDashboard() {
  document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" });
}

const HERO_BG_IMAGE = "/leclerc-monaco-win.jpg";

export function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{
        backgroundImage: `url('${HERO_BG_IMAGE}')`,
        backgroundSize: "cover",
        backgroundPosition: "center 20%",
        backgroundAttachment: "fixed",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            "linear-gradient(to bottom, rgba(5, 5, 8, 0.82), rgba(5, 5, 8, 0.88))",
        }}
      />
      <div
        className="absolute inset-0 opacity-100 pointer-events-none"
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(rgba(228, 3, 46, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(228, 3, 46, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          animation: "grid-drift 20s linear infinite",
        }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 w-full max-w-5xl mx-auto">
        <h1
          className="reveal text-center"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 900,
            fontSize: "clamp(56px, 12vw, 160px)",
            color: "var(--home-text-primary)",
            lineHeight: 0.92,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}
        >
          CL16
          <span
            style={{
              color: "var(--ferrari-red)",
              margin: "0 0.12em",
            }}
          >
            ·
          </span>
          LECLERCAI
        </h1>

        <p
          className="reveal reveal-delay-1 mt-8 mb-12 max-w-lg mx-auto"
          style={{
            fontFamily: "var(--font-body)",
            fontWeight: 300,
            fontSize: "clamp(17px, 2.2vw, 22px)",
            color: "var(--home-text-secondary)",
            lineHeight: 1.6,
          }}
        >
          AI-powered Race Engineer for Charles Leclerc.
        </p>

        <button
          type="button"
          onClick={scrollToDashboard}
          className="reveal reveal-delay-2 transition-[background] duration-150"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "white",
            background: "transparent",
            border: "1px solid var(--ferrari-red)",
            padding: "14px 32px",
            borderRadius: 2,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--ferrari-red)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          OPEN PIT WALL →
        </button>
      </div>

      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        style={{
          color: "var(--home-text-muted)",
          animation: "chevron-bounce 2s ease-in-out infinite",
        }}
        aria-hidden
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>
    </section>
  );
}
