import { useState, useEffect, useRef } from "react";

interface RadioMessageProps {
  message: string;
  urgency: "ROUTINE" | "ADVISORY" | "URGENT";
  lapNumber: number;
  isNew: boolean;
}

const BORDER_COLORS = {
  ROUTINE: "var(--dash-border-bright)",
  ADVISORY: "var(--status-warn)",
  URGENT: "var(--status-urgent)",
};

const LABEL_COLORS = {
  ROUTINE: "var(--dash-text-muted)",
  ADVISORY: "var(--status-warn)",
  URGENT: "var(--status-urgent)",
};

export function RadioMessage({
  message,
  urgency,
  lapNumber,
  isNew,
}: RadioMessageProps) {
  const [displayedText, setDisplayedText] = useState(isNew ? "" : message);
  const [done, setDone] = useState(!isNew);
  const indexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isNew || !message) {
      setDisplayedText(message);
      setDone(true);
      return;
    }
    setDisplayedText("");
    setDone(false);
    indexRef.current = 0;
    intervalRef.current = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current > message.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setDisplayedText(message);
        setDone(true);
        return;
      }
      setDisplayedText(message.slice(0, indexRef.current));
    }, 25);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [message, isNew]);

  const borderColor = BORDER_COLORS[urgency];
  const labelColor = LABEL_COLORS[urgency];
  const isUrgent = urgency === "URGENT";
  const isRaceStart = urgency === "ROUTINE" && lapNumber <= 2;

  return (
    <div
      className="border-b border-[var(--dash-border)] pl-4 pr-3 py-3 last:border-b-0"
      style={{
        borderLeft: isRaceStart
          ? "3px solid var(--ferrari-red)"
          : `3px solid ${borderColor}`,
        background: isUrgent
          ? "rgba(255, 87, 34, 0.06)"
          : "rgba(0, 0, 0, 0.12)",
      }}
    >
      <div className="flex justify-between items-center mb-1">
        <span
          className="uppercase tracking-wider"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 9,
            letterSpacing: "0.2em",
            color: labelColor,
          }}
        >
          {urgency}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--dash-text-muted)",
          }}
        >
          LAP {lapNumber}
        </span>
      </div>
      {isRaceStart && (
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: "var(--ferrari-red)",
            marginBottom: 6,
          }}
        >
          RACE START
        </div>
      )}
      <p
        className="leading-relaxed m-0"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--dash-text-primary)",
          lineHeight: 1.55,
        }}
      >
        {displayedText || (done ? "(empty)" : "")}
        {!done && (
          <span className="cursor-blink" style={{ opacity: 1 }}>
            |
          </span>
        )}
      </p>
    </div>
  );
}
