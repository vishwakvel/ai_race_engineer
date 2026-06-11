/** Five pillars — same substance as the original FeatureSection. */
const STEPS = [
  {
    title: "Tyre Strategy",
    body: "Stint length and compound choice win or lose races. Pace isn't flat—it drops when the tyre goes off. That curve drives every pit-window conversation.",
  },
  {
    title: "Weather & Track",
    body: "Track temp, rain, wind—they change grip and lap time in ways pace alone won't show. Conditions are part of the story on every lap.",
  },
  {
    title: "Safety Car Chaos",
    body: "Safety cars and pack-ups rewrite strategy in seconds. Reading when the race might breathe—or snap—matters as much as raw speed.",
  },
  {
    title: "The Pit Call",
    body: "Box now, extend, or undercut? One stop or two? The right move depends on everything above—not a single number on a screen.",
  },
  {
    title: "Engineer Radio",
    body: "It has to sound like the pit wall: calm when it's routine, sharp when it's not. One voice that's weighed all of it before speaking.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section
      id="process-section"
      className="landing-section process-section"
      data-landing-section="process"
      aria-label="How LeclercAI works"
    >
      <div className="process-inner">
        <div className="process-heading-block">
          <span className="landing-label">(Process)</span>
          <h2 className="process-heading">
            HOW IT
            <br />
            WORKS
          </h2>
        </div>

        <div className="process-viewport">
          <div className="process-track" data-process-track>
            {STEPS.map((step, i) => {
              const titleWords = step.title.split(/\s+/);
              return (
                <article key={step.title} className="process-card" data-process-card>
                  <div className="process-step">
                    STEP {i + 1}.
                    <span className="process-step-mark" aria-hidden="true" />
                  </div>

                  <div className="process-card-spacer" aria-hidden="true" />

                  <div className="process-card-bottom">
                    <h3 className="process-card-title">
                      {titleWords.map((word) => (
                        <span key={word} className="process-card-title-word">
                          {word}
                        </span>
                      ))}
                    </h3>
                    <p className="process-card-body">{step.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
