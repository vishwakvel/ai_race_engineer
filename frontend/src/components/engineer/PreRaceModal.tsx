import { useState, useEffect, useRef } from "react";
import type { StrategyOption } from "@/types";

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "var(--tyre-soft)",
  MEDIUM: "var(--tyre-medium)",
  HARD: "var(--tyre-hard)",
  INTERMEDIATE: "var(--tyre-inter)",
  WET: "var(--tyre-wet)",
};

interface PreRaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  recommended: StrategyOption;
  alternative1: StrategyOption;
  alternative2: StrategyOption;
  openingMessage: string;
}

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const iRef = useRef(0);

  useEffect(() => {
    if (!text) return;
    setDisplayed("");
    iRef.current = 0;
    const id = setInterval(() => {
      iRef.current += 1;
      if (iRef.current > text.length) {
        clearInterval(id);
        setDisplayed(text);
        return;
      }
      setDisplayed(text.slice(0, iRef.current));
    }, 25);
    return () => clearInterval(id);
  }, [text]);

  return (
    <span>
      {displayed}
      {displayed.length < text.length && (
        <span className="cursor-blink">|</span>
      )}
    </span>
  );
}

export function PreRaceModal({
  isOpen,
  onClose,
  recommended,
  alternative1,
  alternative2,
  openingMessage,
}: PreRaceModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="max-w-[900px] w-full rounded overflow-hidden max-h-[80vh] overflow-y-auto"
        style={{
          background: "var(--dash-surface)",
          border: "1px solid var(--dash-border-bright)",
          borderTop: "3px solid var(--ferrari-red)",
          borderRadius: 4,
          padding: 40,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 20,
              letterSpacing: "0.1em",
              color: "var(--dash-text-primary)",
              textTransform: "uppercase",
            }}
          >
            PRE-RACE STRATEGY BRIEF
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 12,
              color: "var(--dash-text-secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div
          className="mb-8 font-mono text-sm leading-relaxed"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--dash-text-secondary)",
          }}
        >
          {openingMessage ? (
            <TypewriterText text={openingMessage} />
          ) : (
            "Opening message placeholder"
          )}
        </div>

        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
        >
          <StrategyColumn
            label="RECOMMENDED"
            option={recommended}
            accentBorder
            showSetButton
          />
          <StrategyColumn label="ALTERNATIVE" option={alternative1} />
          <StrategyColumn label="ALTERNATIVE" option={alternative2} />
        </div>
      </div>
    </div>
  );
}

function StrategyColumn({
  label,
  option,
  accentBorder,
  showSetButton,
}: {
  label: string;
  option: StrategyOption;
  accentBorder?: boolean;
  showSetButton?: boolean;
}) {
  return (
    <div
      className="rounded p-4"
      style={{
        background: "var(--dash-elevated)",
        border: "1px solid var(--dash-border)",
        borderTop: accentBorder ? "2px solid var(--status-gain)" : undefined,
        borderRadius: 4,
      }}
    >
      <div
        className="mb-3 uppercase tracking-wider"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 10,
          color: "var(--dash-text-secondary)",
        }}
      >
        {label}
      </div>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {option.compounds.map((c, j) => (
          <span key={j} className="flex items-center gap-1">
            <span
              className="inline-block w-5 h-5 rounded-full shrink-0"
              style={{ background: COMPOUND_COLORS[c] ?? "var(--dash-border)" }}
            />
            {j < option.compounds.length - 1 && (
              <span style={{ color: "var(--dash-text-muted)", fontSize: 12 }}>→</span>
            )}
          </span>
        ))}
      </div>
      <div
        className="mb-1 uppercase text-[10px] tracking-wider"
        style={{ color: "var(--dash-text-muted)", fontFamily: "var(--font-display)" }}
      >
        STINT LENGTHS
      </div>
      <div
        className="mb-3 font-mono text-sm"
        style={{ color: "var(--dash-text-primary)", fontFamily: "var(--font-mono)" }}
      >
        {option.stintLengths.join(" · ")} LAPS
      </div>
      <div
        className="mb-1 uppercase text-[10px] tracking-wider"
        style={{ color: "var(--dash-text-muted)", fontFamily: "var(--font-display)" }}
      >
        EXPECTED POSITION
      </div>
      <div
        className="mb-3 font-mono text-lg font-semibold"
        style={{ color: "var(--dash-text-primary)", fontFamily: "var(--font-mono)" }}
      >
        P{option.expectedPosition}
      </div>
      <p
        className="text-sm mb-4"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--dash-text-secondary)",
          lineHeight: 1.5,
        }}
      >
        {option.rationale}
      </p>
      {showSetButton && (
        <button
          type="button"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            padding: "6px 12px",
            borderRadius: 2,
            background: "var(--dash-border-bright)",
            color: "var(--dash-text-secondary)",
            border: "none",
            cursor: "pointer",
          }}
        >
          SET AS PLAN
        </button>
      )}
    </div>
  );
}
