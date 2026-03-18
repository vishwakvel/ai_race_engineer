import { useEffect, useRef, useState } from "react";
import { useRaceStore } from "@/store/raceStore";

export function BoxBoxBanner() {
  const pitEvents = useRaceStore((s) => s.pitEvents);
  const [isVisible, setIsVisible] = useState(false);
  const [compound, setCompound] = useState("");
  const [pitLap, setPitLap] = useState<number | null>(null);
  const prevLengthRef = useRef(0);
  const prevLapRef = useRef<number | null>(null);

  useEffect(() => {
    const latest = pitEvents[pitEvents.length - 1];
    const newEvent =
      pitEvents.length > prevLengthRef.current ||
      (latest && latest.lap !== prevLapRef.current);

    if (newEvent && latest) {
      prevLengthRef.current = pitEvents.length;
      prevLapRef.current = latest.lap;
      setCompound(latest.compound);
      setPitLap(latest.lap);
      setIsVisible(true);
    }
  }, [pitEvents]);

  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [isVisible]);

  if (!isVisible) return null;

  const compoundColors: Record<string, string> = {
    SOFT: "#E8334A",
    MEDIUM: "#F5C518",
    HARD: "#D8D8D8",
    INTERMEDIATE: "#39C473",
    WET: "#4A9FE0",
  };
  const color = compoundColors[compound.toUpperCase()] ?? "#E4032E";

  return (
    <div
      style={{
        position: "fixed",
        top: 56,
        left: 0,
        right: 0,
        zIndex: 1000,
        background:
          "linear-gradient(90deg, rgba(0,0,0,0.95) 0%, rgba(20,0,0,0.97) 50%, rgba(0,0,0,0.95) 100%)",
        borderBottom: `2px solid ${color}`,
        borderTop: `2px solid ${color}`,
        padding: "14px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        animation: "slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          fontSize: "clamp(24px, 4vw, 40px)",
          letterSpacing: "0.3em",
          color,
          textTransform: "uppercase",
        }}
      >
        BOX BOX
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "rgba(255,255,255,0.6)",
            letterSpacing: "0.1em",
          }}
        >
          SWITCHING TO
        </span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 20,
            color,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            background: "rgba(0,0,0,0.4)",
            border: `1px solid ${color}`,
            padding: "4px 16px",
            borderRadius: 2,
          }}
        >
          {compound.toUpperCase()}
        </span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "rgba(255,255,255,0.4)",
          letterSpacing: "0.15em",
        }}
      >
        LAP {pitLap ?? ""}
      </div>
    </div>
  );
}
