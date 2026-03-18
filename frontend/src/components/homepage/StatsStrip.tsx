import { useEffect, useRef, useState } from "react";

const STATS = [
  { value: 7, label: "SEASONS IN F1", accent: false },
  { value: 27, label: "POLE POSITIONS", accent: true },
  { value: 8, label: "RACE WINS", accent: true },
  { value: null, label: "DATA RANGE", text: "2018 — 2024", accent: false },
] as const;

function AnimatedNumber({
  target,
  duration = 1200,
  visible,
}: {
  target: number;
  duration?: number;
  visible: boolean;
}) {
  const [n, setN] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!visible) return;
    startRef.current = null;
    setN(0);
    const step = (timestamp: number) => {
      if (startRef.current == null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 2;
      setN(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, visible]);

  return <span>{n}</span>;
}

export function StatsStrip() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible(true);
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="w-full py-10 border-t border-b flex items-center justify-center"
      style={{
        background: "var(--home-surface)",
        borderColor: "var(--home-border)",
      }}
    >
      <div className="flex items-center justify-center gap-0 max-w-[1200px] w-full px-6">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="flex-1 flex flex-col items-center justify-center px-6 py-2 border-r last:border-r-0 border-[var(--home-border)]"
          >
            <div
              className="reveal text-center"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "clamp(48px, 6vw, 80px)",
                color: stat.accent ? "var(--ferrari-red)" : "var(--home-text-primary)",
              }}
            >
              {stat.value != null ? (
                <AnimatedNumber target={stat.value} visible={visible} />
              ) : (
                <span
                  style={{
                    opacity: visible ? 1 : 0,
                    transition: "opacity 0.6s ease",
                    fontSize: "clamp(24px, 3vw, 36px)",
                  }}
                >
                  {stat.text}
                </span>
              )}
            </div>
            <div
              className="mt-2"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 400,
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--home-text-muted)",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
