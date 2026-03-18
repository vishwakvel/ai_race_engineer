import { useRaceStore } from "@/store/raceStore";

function getArcColor(p: number) {
  if (p > 0.35) return "var(--status-sc)";
  if (p > 0.2) return "var(--status-warn)";
  return "#1a5c1a";
}

export function SafetyCarGauge() {
  const xgbOutput = useRaceStore((s) => s.xgbOutput);
  const allLaps = useRaceStore((s) => s.allLaps);
  const currentLap = useRaceStore((s) => s.currentLap);
  const lap = allLaps.find((l) => l.lapNumber === currentLap);

  const scProbability = xgbOutput?.scProbability ?? 0;
  const topFactors = xgbOutput?.topShapFactors ?? [];
  const safetyCarActive = lap?.safetyCarActive ?? false;

  if (safetyCarActive) {
    return (
      <div
        className="rounded p-4 w-full"
        style={{
          background: "rgba(255, 152, 0, 0.1)",
          border: "1px solid var(--status-sc)",
          borderRadius: 4,
          animation: "sc-pulse 1.5s ease-in-out infinite",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--status-sc)",
            textAlign: "center",
            fontWeight: 700,
          }}
        >
          SAFETY CAR DEPLOYED
        </div>
      </div>
    );
  }

  const pct = Math.round(scProbability * 100);
  const color = getArcColor(scProbability);
  const circumference = Math.PI * 45;
  const offset = circumference * (1 - scProbability);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-24 flex items-center justify-center">
        <svg width="120" height="70" viewBox="0 0 120 70" className="overflow-visible">
          <path
            d="M 10 65 A 50 50 0 0 1 110 65"
            fill="none"
            stroke="var(--dash-border)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M 10 65 A 50 50 0 0 1 110 65"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pt-2"
          style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}
        >
          <span
            style={{
              fontSize: "clamp(28px, 4vw, 40px)",
              color,
              lineHeight: 1,
            }}
          >
            {pct}
          </span>
          <span style={{ fontSize: 16, color, marginTop: -4 }}>%</span>
        </div>
      </div>
      <div className="mt-4 w-full">
        <div
          className="mb-2 uppercase tracking-wider"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 9,
            color: "var(--dash-text-muted)",
          }}
        >
          TOP FACTORS
        </div>
        <div className="flex flex-wrap gap-2">
          {(topFactors.length ? topFactors.slice(0, 2) : [
            { feature: "CIRCUIT HISTORY", impact: 0 },
            { feature: "TYRE AGE FIELD", impact: 0 },
          ]).map((f) => (
            <span
              key={f.feature}
              className="rounded-sm px-2 py-0.5"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--dash-text-secondary)",
                background: "var(--dash-elevated)",
                border: "1px solid var(--dash-border)",
                borderRadius: 2,
              }}
            >
              {f.feature}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
