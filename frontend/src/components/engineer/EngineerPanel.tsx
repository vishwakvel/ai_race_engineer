import { useRef, useEffect } from "react";
import { RadioMessage } from "./RadioMessage";
import { useRaceStore } from "@/store/raceStore";

export function EngineerPanel() {
  const messages = useRaceStore((s) => s.messages);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current && messages.length > 0) {
      feedRef.current.scrollTop = 0;
    }
  }, [messages.length]);

  return (
    <div className="h-full flex flex-col min-h-0 bg-[var(--dash-surface)]">
      <div
        className="flex-shrink-0 px-4 py-3 border-b border-[var(--dash-border)]"
        style={{
          height: 40,
          fontFamily: "var(--font-display)",
          fontSize: 10,
          letterSpacing: "0.2em",
          color: "var(--dash-text-secondary)",
          textTransform: "uppercase",
        }}
      >
        TEAM RADIO — X. MARCOS PADROS
      </div>

      <div
        ref={feedRef}
        className="engineer-feed flex-1 min-h-0 overflow-y-auto flex flex-col"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--dash-border-bright) transparent",
        }}
      >
        {messages.length === 0 ? (
          <div
            className="flex items-center justify-center flex-1 min-h-[120px] px-4"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--dash-text-muted)",
            }}
          >
            NO MESSAGES YET
          </div>
        ) : (
          messages.slice(0, 20).map((msg, i) => (
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
