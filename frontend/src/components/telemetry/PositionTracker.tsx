import { useRaceStore } from "@/store/raceStore";

export function PositionTracker() {
  const allLaps = useRaceStore((s) => s.allLaps);
  const currentLap = useRaceStore((s) => s.currentLap);
  const lap = allLaps.find((l) => l.lapNumber === currentLap);
  const position = lap?.position ?? 0;
  const gapAhead = lap?.gapAhead ?? 0;
  const gapBehind = lap?.gapBehind ?? 0;

  return (
    <div
      className="flex flex-wrap items-baseline gap-6"
      style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}
    >
      <div>
        <span style={{ color: "var(--dash-text-muted)" }}>POSITION </span>
        <span style={{ color: "var(--dash-text-primary)", fontWeight: 600 }}>
          P{position || "—"}
        </span>
      </div>
      <div>
        <span style={{ color: "var(--dash-text-muted)" }}>GAP AHEAD </span>
        <span style={{ color: "var(--dash-text-primary)" }}>
          {position > 1 && gapAhead === 0 ? "–" : `${gapAhead.toFixed(2)}s`}
        </span>
      </div>
      <div>
        <span style={{ color: "var(--dash-text-muted)" }}>GAP BEHIND </span>
        <span style={{ color: "var(--dash-text-primary)" }}>
          {gapBehind.toFixed(2)}s
        </span>
      </div>
    </div>
  );
}
