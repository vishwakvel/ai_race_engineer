import { COMPOUND_COLORS } from "@/design/tokens";

export interface StintSegment {
  startLap: number;
  endLap: number;
  compound: string;
  length: number;
}

interface StrategyTimelineProps {
  totalLaps: number;
  currentLap: number;
  stints: StintSegment[];
  /** Narrow sidebar layout — shorter bar, smaller labels. */
  compact?: boolean;
}

export function StrategyTimeline({
  totalLaps,
  currentLap,
  stints,
  compact = false,
}: StrategyTimelineProps) {
  const total = totalLaps || 52;
  const barH = compact ? 22 : 32;

  if (stints.length === 0) {
    return (
      <div>
        <div
          className="flex w-full rounded-sm overflow-hidden mb-2"
          style={{ height: barH, background: "var(--dash-elevated)" }}
        >
          <div className="flex-1 opacity-60" style={{ background: "var(--dash-border)" }} />
          <div className="flex-1 opacity-80" style={{ background: "var(--dash-border)" }} />
          <div className="flex-1 opacity-60" style={{ background: "var(--dash-border)" }} />
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: compact ? 10 : 12,
            color: "var(--dash-text-secondary)",
          }}
        >
          LAP {currentLap} / {total} · 0 STINTS
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: barH,
          background: "var(--dash-elevated)",
          borderRadius: 2,
          marginBottom: compact ? 4 : 8,
        }}
      >
        {stints.map((stint) => {
          const left = ((stint.startLap - 1) / total) * 100;
          const width = (stint.length / total) * 100;
          const color = COMPOUND_COLORS[stint.compound] ?? COMPOUND_COLORS.UNKNOWN;
          const isCompleted = stint.endLap < currentLap;
          const isFuture = stint.startLap > currentLap;
          const isCurrent = !isCompleted && !isFuture;
          const opacity = isCompleted ? 1.0 : isFuture ? 0.4 : 0.85;
          return (
            <div
              key={`${stint.compound}-${stint.startLap}`}
              style={{
                position: "absolute",
                left: `${left}%`,
                width: `${width}%`,
                height: "100%",
                background: color,
                opacity,
                borderRadius: 2,
                boxShadow: isCurrent ? "0 0 0 2px rgba(255,255,255,0.35)" : undefined,
              }}
              title={`${stint.compound} · Laps ${stint.startLap}–${stint.endLap}`}
            />
          );
        })}
        <div
          style={{
            position: "absolute",
            left: `${((currentLap - 1) / total) * 100}%`,
            width: 2,
            height: "100%",
            background: "white",
          }}
        >
          {!compact && (
            <span
              className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 9,
                color: "var(--dash-text-muted)",
                letterSpacing: "0.1em",
              }}
            >
              NOW
            </span>
          )}
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: compact ? 10 : 12,
          color: "var(--dash-text-secondary)",
        }}
      >
        LAP {currentLap} / {total} · {stints.length} STINTS
      </div>
    </div>
  );
}
