import { useEffect, useRef, useState } from "react";
import { useRaceStore } from "@/store/raceStore";
import { compoundColor } from "@/design/tokens";
import { RaceLoadBar } from "@/components/layout/RaceLoadBar";

function gapText(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}s`;
}

/**
 * Broadcast-style timing strip: lap counter, position, tyre, gaps, SC risk.
 * Lives directly under the header — the single place for live session state.
 */
export function TimingStrip() {
  const raceLoaded = useRaceStore((s) => s.raceLoaded);
  const currentLap = useRaceStore((s) => s.currentLap);
  const totalLaps = useRaceStore((s) => s.totalLaps);
  const allLaps = useRaceStore((s) => s.allLaps);
  const xgbOutput = useRaceStore((s) => s.xgbOutput);
  const previousPosition = useRaceStore((s) => s.previousPosition);

  const [lapFlash, setLapFlash] = useState(false);
  const prevLapRef = useRef(currentLap);
  const [positionColor, setPositionColor] = useState("var(--dash-text-primary)");

  const lap = allLaps.find((l) => l.lapNumber === currentLap);
  const position = lap?.position ?? 0;
  const rainfall = lap?.rainfall ?? 0;
  const scActive = lap?.safetyCarActive ?? false;
  const scProbability = xgbOutput?.scProbability ?? 0;
  const maxLap =
    allLaps.length > 0 ? Math.max(...allLaps.map((l) => l.lapNumber)) : 0;
  const displayTotal = totalLaps > 0 ? totalLaps : maxLap || "—";

  useEffect(() => {
    if (currentLap !== prevLapRef.current) {
      setLapFlash(true);
      prevLapRef.current = currentLap;
      const t = setTimeout(() => setLapFlash(false), 400);
      return () => clearTimeout(t);
    }
  }, [currentLap]);

  useEffect(() => {
    if (previousPosition == null || totalLaps === 0) return;
    const current = allLaps.find((l) => l.lapNumber === currentLap)?.position;
    if (current == null) return;
    if (current < previousPosition) setPositionColor("var(--status-gain)");
    else if (current > previousPosition) setPositionColor("var(--status-loss)");
    const t = setTimeout(
      () => setPositionColor("var(--dash-text-primary)"),
      1500
    );
    return () => clearTimeout(t);
  }, [currentLap, previousPosition, allLaps, totalLaps]);

  const flagColor = scActive
    ? "var(--status-sc)"
    : rainfall === 1
      ? "var(--tyre-wet)"
      : "var(--status-gain)";
  const flagLabel = scActive ? "SC" : rainfall === 1 ? "WET" : "GREEN";

  const tyreColor = compoundColor(lap?.compoundStr);

  return (
    <div
      className="flex items-center gap-0 min-h-10 h-10 px-4 border-b border-dash-border bg-dash-surface overflow-x-auto whitespace-nowrap"
      role="status"
      aria-label="Live session timing"
    >
      {/* Track status flag */}
      <span
        className="flex items-center gap-2 pr-4 mr-4 border-r border-dash-border font-display text-[11px] font-bold tracking-[0.15em] shrink-0"
        style={{ color: flagColor }}
      >
        <span
          className="inline-block w-2.5 h-2.5 rounded-[2px]"
          style={{ background: flagColor }}
          aria-hidden
        />
        {flagLabel}
      </span>

      <RaceLoadBar />

      <span
        className="pr-4 mr-4 border-r border-dash-border font-display text-[12px] font-bold tracking-[0.1em] transition-colors duration-300"
        style={{
          color: lapFlash ? "var(--ferrari-red)" : "var(--dash-text-primary)",
        }}
      >
        LAP {raceLoaded ? currentLap : "—"} / {raceLoaded ? displayTotal : "—"}
      </span>

      <span
        className="pr-4 mr-4 border-r border-dash-border font-display text-[12px] font-extrabold transition-colors duration-500"
        style={{ color: positionColor }}
      >
        P{position || "—"}
      </span>

      {/* Tyre chip */}
      <span className="flex items-center gap-1.5 pr-4 mr-4 border-r border-dash-border font-mono text-[11px] text-dash-text-secondary">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full border"
          style={{ borderColor: tyreColor, background: "transparent" }}
          aria-hidden
        />
        {lap?.compoundStr?.slice(0, 3) ?? "—"}
        <span className="text-dash-text-muted">{lap ? `${lap.tyreAge}L` : ""}</span>
      </span>

      <span className="pr-4 mr-4 border-r border-dash-border font-mono text-[11px] text-dash-text-secondary">
        <span className="text-dash-text-muted">AHD </span>
        {gapText(lap?.gapAhead)}
        <span className="text-dash-text-muted ml-2">BHD </span>
        {gapText(lap?.gapBehind)}
      </span>

      {/* SC probability micro-bar */}
      <span className="flex items-center gap-2 font-mono text-[11px] text-dash-text-secondary">
        SC
        <span
          className="inline-block w-[90px] h-1.5 rounded-sm overflow-hidden bg-dash-border align-middle"
          role="progressbar"
          aria-valuenow={Math.round(scProbability * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Safety car probability ${Math.round(scProbability * 100)} percent`}
        >
          <span
            className="block h-full rounded-sm transition-[width] duration-700 ease-out"
            style={{
              width: `${Math.min(100, scProbability * 100)}%`,
              background:
                scProbability > 0.5
                  ? "var(--status-sc)"
                  : scProbability > 0.3
                    ? "var(--status-warn)"
                    : "var(--status-gain)",
            }}
          />
        </span>
        {Math.round(scProbability * 100)}%
      </span>

      {rainfall === 1 && (
        <span className="ml-4 font-mono text-[10px] text-tyre-wet" title="Rain">
          🌧 RAIN
        </span>
      )}
    </div>
  );
}
