import { useEffect, useRef } from "react";
import { useRaceStore } from "@/store/raceStore";
import { RadioMessage } from "./RadioMessage";

const SHELL: React.CSSProperties = {
  width: "100%",
  height: "100%",
  maxHeight: "100%",
  flex: "1 1 0%",
  minHeight: 0,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  position: "relative",
  background: "var(--dash-surface)",
  border: "1px solid var(--dash-border)",
  borderRadius: 4,
  boxSizing: "border-box",
  boxShadow: "inset 0 2px 0 0 var(--ferrari-red)",
};

const HEADER: React.CSSProperties = {
  flexShrink: 0,
  padding: "14px 20px 12px",
  borderBottom: "1px solid var(--dash-border)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const FEED: React.CSSProperties = {
  flex: "1 1 0%",
  minHeight: 0,
  minWidth: 0,
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  display: "flex",
  flexDirection: "column",
  background: "var(--dash-elevated)",
};

export function EngineerPanel() {
  const messages = useRaceStore((s) => s.messages);
  const currentLap = useRaceStore((s) => s.currentLap);
  const raceLoaded = useRaceStore((s) => s.raceLoaded);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!feedRef.current) return;
    feedRef.current.scrollTop = 0;
  }, [messages.length]);

  return (
    <div style={SHELL}>
      <div style={HEADER}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: "0.2em",
              color: "var(--dash-text-secondary)",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            TEAM RADIO
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              color: "var(--dash-text-muted)",
              textTransform: "uppercase",
            }}
          >
            X. Marcos Padros
          </div>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.12em",
            color: "var(--dash-text-primary)",
            paddingTop: 2,
            whiteSpace: "nowrap",
          }}
        >
          {raceLoaded && currentLap > 0 ? `LAP ${currentLap}` : "—"}
        </div>
      </div>

      <div ref={feedRef} className="radio-feed" style={FEED}>
        {messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              minHeight: 120,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--dash-text-muted)",
              padding: 24,
              textAlign: "center",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            No messages yet
          </div>
        ) : (
          messages.map((msg, i) => (
            <RadioMessage
              key={msg.id}
              message={msg.message}
              urgency={msg.urgency}
              lapNumber={msg.lapNumber}
              isNew={i === 0 && msg.isNew !== false}
            />
          ))
        )}
      </div>
    </div>
  );
}
