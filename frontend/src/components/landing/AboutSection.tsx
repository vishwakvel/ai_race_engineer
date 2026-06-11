const STATEMENT =
  "LeclercAI combines real F1 telemetry and machine learning to put a world-class race engineer in your hands.";

export function AboutSection() {
  const words = STATEMENT.split(/\s+/);

  return (
    <section
      id="about-section"
      className="landing-section"
      data-landing-section="about"
      aria-label="About LeclercAI"
    >
      <div className="about-inner">
        <span className="landing-label">(About)</span>
        <p className="about-statement" data-about-text>
          {words.map((word, i) => (
            <span key={`${word}-${i}`}>
              <span className="about-word" data-about-word>
                {word}
              </span>
              {i < words.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
