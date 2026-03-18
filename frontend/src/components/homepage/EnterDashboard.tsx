function scrollToDashboard() {
  document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" });
}

export function EnterDashboard() {
  return (
    <section
      className="min-h-[60vh] flex flex-col items-center justify-center relative border-t-[4px] border-[var(--ferrari-red)]"
      style={{ background: "var(--home-bg)" }}
    >
      <div
        className="mb-4"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          fontSize: "clamp(60px, 10vw, 120px)",
          color: "var(--home-text-primary)",
          textTransform: "uppercase",
        }}
      >
        READY.
      </div>
      <div
        className="mb-8"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 400,
          fontSize: 16,
          letterSpacing: "0.2em",
          color: "var(--home-text-secondary)",
          textTransform: "uppercase",
        }}
      >
        SELECT A RACE AND BEGIN.
      </div>
      <button
        type="button"
        onClick={scrollToDashboard}
        className="transition-[background] duration-150 mb-10"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 16,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "white",
          background: "transparent",
          border: "1px solid var(--ferrari-red)",
          padding: "18px 48px",
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
      <div className="flex flex-col items-center">
        <span
          className="mb-2"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            letterSpacing: "0.3em",
            color: "var(--home-text-muted)",
            textTransform: "uppercase",
          }}
        >
          ↓ THE PIT WALL
        </span>
        <div
          style={{
            width: 2,
            height: 40,
            background: "var(--home-border-accent)",
          }}
        />
      </div>
    </section>
  );
}
