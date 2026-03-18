/** Five pillars — why each angle matters (detail lives in the README). */
const PILLARS = [
  {
    hook: "THE RUBBER",
    body: "Stint length and compound choice win or lose races. Pace isn’t flat—it drops when the tyre goes off. That curve drives every pit-window conversation.",
  },
  {
    hook: "THE SKY",
    body: "Track temp, rain, wind—they change grip and lap time in ways pace alone won’t show. Conditions are part of the story on every lap.",
  },
  {
    hook: "THE CHAOS",
    body: "Safety cars and pack-ups rewrite strategy in seconds. Reading when the race might breathe—or snap—matters as much as raw speed.",
  },
  {
    hook: "THE CALL",
    body: "Box now, extend, or undercut? One stop or two? The right move depends on everything above—not a single number on a screen.",
  },
  {
    hook: "THE RADIO",
    body: "It has to sound like the pit wall: calm when it’s routine, sharp when it’s not. One voice that’s weighed all of it before speaking.",
  },
];

export function FeatureSection() {
  return (
    <section
      className="w-full py-[100px] px-4"
      style={{ background: "var(--home-bg)" }}
    >
      <div className="max-w-[1000px] mx-auto">
        <div
          className="mb-3"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            letterSpacing: "0.25em",
            color: "var(--ferrari-red)",
            textTransform: "uppercase",
          }}
        >
          THE FULL PICTURE
        </div>
        <h2
          className="reveal mb-4"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "clamp(32px, 5vw, 52px)",
            color: "var(--home-text-primary)",
            lineHeight: 1.05,
            textTransform: "uppercase",
          }}
        >
          FIVE THINGS
          <br />
          <span style={{ color: "var(--home-text-secondary)", fontWeight: 600 }}>
            ON EVERY LAP
          </span>
        </h2>
        <p
          className="reveal reveal-delay-1 mb-14 max-w-2xl"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 16,
            fontWeight: 300,
            color: "var(--home-text-secondary)",
            lineHeight: 1.65,
          }}
        >
          Not a gadget list—just the angles a real engineer has to hold in
          their head. If you’re only watching one of these, you’re guessing.
        </p>

        <div className="flex flex-col gap-4">
          {PILLARS.map((p, i) => (
            <div
              key={p.hook}
              className={
                i === 0
                  ? "reveal reveal-delay-1"
                  : i === 1
                    ? "reveal reveal-delay-2"
                    : "reveal"
              }
              style={{
                background: "var(--home-card)",
                border: "1px solid var(--home-border)",
                borderRadius: 6,
                padding: "28px 32px",
              }}
            >
              <h3
                className="mb-3"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: 15,
                  letterSpacing: "0.12em",
                  color: "var(--ferrari-red)",
                  textTransform: "uppercase",
                }}
              >
                {p.hook}
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  fontSize: 16,
                  color: "var(--home-text-secondary)",
                  lineHeight: 1.65,
                  maxWidth: 720,
                }}
              >
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
