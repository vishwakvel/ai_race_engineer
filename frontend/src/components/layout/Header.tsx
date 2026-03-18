import { useRaceStore } from "@/store/raceStore";
import { useState, useEffect, useRef } from "react";

export function Header() {
  const currentLap = useRaceStore((s) => s.currentLap);
  const totalLaps = useRaceStore((s) => s.totalLaps);
  const allLaps = useRaceStore((s) => s.allLaps);
  const xgbOutput = useRaceStore((s) => s.xgbOutput);
  const previousPosition = useRaceStore((s) => s.previousPosition);
  const setPreRaceModalOpen = useRaceStore((s) => s.setPreRaceModalOpen);

  const [lapFlash, setLapFlash] = useState(false);
  const prevLapRef = useRef(currentLap);
  const [positionColor, setPositionColor] = useState<string>("var(--dash-text-primary)");
  const [raceEndGlow, setRaceEndGlow] = useState(false);
  const [raceWinText, setRaceWinText] = useState(false);

  const currentLapData = allLaps.find((l) => l.lapNumber === currentLap);
  const position = currentLapData?.position ?? 0;
  const rainfall = currentLapData?.rainfall ?? 0;
  const scProbability = xgbOutput?.scProbability ?? 0;
  const maxLap = allLaps.length > 0 ? Math.max(...allLaps.map((l) => l.lapNumber)) : 0;
  const displayTotal = totalLaps > 0 ? totalLaps : maxLap || "—";
  const isRaceEnd = currentLap >= maxLap && maxLap > 0;
  const finalPosition = isRaceEnd ? (allLaps.find((l) => l.lapNumber === maxLap)?.position ?? position) : null;

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
    const t = setTimeout(() => setPositionColor("var(--dash-text-primary)"), 1500);
    return () => clearTimeout(t);
  }, [currentLap, previousPosition, allLaps, totalLaps]);

  useEffect(() => {
    if (isRaceEnd && finalPosition != null && finalPosition <= 3) {
      setRaceEndGlow(true);
      if (finalPosition === 1) setRaceWinText(true);
      const t1 = setTimeout(() => setRaceEndGlow(false), 5000);
      const t2 = setTimeout(() => setRaceWinText(false), 10000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isRaceEnd, finalPosition]);

  const RaindropIcon = () => (
    <svg width={16} height={20} viewBox="0 0 16 20" fill="none" style={{ opacity: rainfall ? 1 : 0, transition: "opacity 0.4s ease" }}>
      <path
        d="M8 0C8 0 12 8 12 12C12 15.3 9.3 18 6 18C2.7 18 0 15.3 0 12C0 8 4 0 8 0Z"
        fill="#4A9FE0"
      />
    </svg>
  );

  return (
    <header
      className="h-14 flex items-center justify-between px-6 flex-shrink-0"
      style={{
        background: "var(--dash-bg)",
        borderBottom: "1px solid var(--ferrari-red)",
        fontFamily: "var(--font-display)",
        boxShadow: raceEndGlow ? "0 0 40px rgba(228, 3, 46, 0.3)" : undefined,
        transition: "box-shadow 1s ease",
      }}
    >
      <div className="flex items-center gap-4">
        <span
          className="font-bold uppercase tracking-[0.12em]"
          style={{ fontSize: 15, color: "var(--dash-text-primary)" }}
        >
          CL16
          <span style={{ color: "var(--ferrari-red)", margin: "0 0.15em" }}>·</span>
          LECLERCAI
        </span>
      </div>

      <div className="flex items-center gap-3">
        {raceWinText && (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: "clamp(18px, 2.5vw, 26px)",
              color: "var(--ferrari-red)",
              letterSpacing: "0.2em",
              animation: "fadeIn 0.5s ease",
            }}
          >
            RACE WIN
          </span>
        )}
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "clamp(22px, 3vw, 32px)",
            color: lapFlash ? "var(--ferrari-red)" : "var(--home-text-primary)",
            transition: "color 0.4s ease",
            letterSpacing: "0.05em",
          }}
        >
          LAP {currentLap} / {displayTotal}
        </span>
      </div>

      <div className="flex items-center gap-6">
        <span
          className="uppercase"
          style={{ fontSize: 13, color: "var(--dash-text-secondary)" }}
        >
          C. LECLERC
        </span>
        <span
          className="font-extrabold"
          style={{
            fontSize: 20,
            color: positionColor,
            transition: "color 0.5s ease",
          }}
        >
          P{position || "—"}
        </span>
        <button
          type="button"
          onClick={() => setPreRaceModalOpen(true)}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 10,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--dash-text-muted)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 6px",
          }}
        >
          PRE-RACE BRIEF
        </button>
        <div className="flex items-center gap-3">
          {rainfall === 1 && (
            <div style={{ opacity: 1, transition: "opacity 0.4s ease" }} title="Rain">
              <RaindropIcon />
            </div>
          )}
          <div className="flex flex-col items-end gap-0.5">
            <span
              className="uppercase"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--dash-text-secondary)",
              }}
            >
              SC
            </span>
            <div
              className="w-[120px] h-1.5 rounded-sm overflow-hidden"
            style={{
              background: "var(--dash-border)",
              borderRadius: 3,
            }}
          >
            <div
              className="h-full rounded-sm transition-[width] duration-[800ms] ease-out"
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
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
