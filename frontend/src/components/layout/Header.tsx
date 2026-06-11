import { useRaceStore } from "@/store/raceStore";
import { useState, useEffect } from "react";

/**
 * Brand header. Live session telemetry lives in the TimingStrip below —
 * this row carries identity, driver, and the pre-race brief entry point.
 */
export function Header() {
  const currentLap = useRaceStore((s) => s.currentLap);
  const allLaps = useRaceStore((s) => s.allLaps);
  const setPreRaceModalOpen = useRaceStore((s) => s.setPreRaceModalOpen);

  const [raceEndGlow, setRaceEndGlow] = useState(false);
  const [raceWinText, setRaceWinText] = useState(false);

  const lap = allLaps.find((l) => l.lapNumber === currentLap);
  const scActive = lap?.safetyCarActive ?? false;

  const maxLap =
    allLaps.length > 0 ? Math.max(...allLaps.map((l) => l.lapNumber)) : 0;
  const isRaceEnd = currentLap >= maxLap && maxLap > 0;
  const finalPosition = isRaceEnd
    ? (allLaps.find((l) => l.lapNumber === maxLap)?.position ?? 0)
    : null;

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

  const headerBorder = scActive
    ? "2px solid var(--timing-yellow)"
    : "1px solid var(--ferrari-red)";
  const headerGlow = scActive
    ? "0 0 24px rgba(255, 210, 0, 0.35)"
    : raceEndGlow
      ? "0 0 40px rgba(228, 3, 46, 0.3)"
      : undefined;

  return (
    <header
      className="h-14 flex items-center justify-between px-6 flex-shrink-0 font-display bg-dash-bg"
      style={{
        borderBottom: headerBorder,
        boxShadow: headerGlow,
        transition: "box-shadow 1s ease, border-color 0.4s ease",
      }}
    >
      <span className="font-bold uppercase tracking-[0.12em] text-[15px] text-dash-text-primary">
        CL16
        <span className="text-ferrari-red mx-[0.15em]">·</span>
        LECLERCAI
      </span>

      {raceWinText && (
        <span
          className="font-black tracking-[0.2em] text-ferrari-red"
          style={{
            fontSize: "clamp(18px, 2.5vw, 26px)",
            animation: "fadeIn 0.5s ease",
          }}
        >
          RACE WIN
        </span>
      )}

      <div className="flex items-center gap-6">
        <span className="uppercase text-[13px] text-dash-text-secondary">
          C. LECLERC
        </span>
        <button
          type="button"
          onClick={() => setPreRaceModalOpen(true)}
          className="font-display text-[11px] tracking-[0.15em] uppercase text-dash-text-muted hover:text-dash-text-primary bg-transparent border-none cursor-pointer px-1.5 py-0.5"
        >
          PRE-RACE BRIEF
        </button>
      </div>
    </header>
  );
}
