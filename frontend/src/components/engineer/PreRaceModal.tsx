import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { StrategyOption } from "@/types";
import { COMPOUND_COLORS } from "@/design/tokens";
import { MOTION } from "@/design/motion";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { useRaceStore } from "@/store/raceStore";

interface PreRaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  recommended: StrategyOption;
  alternative1: StrategyOption;
  alternative2: StrategyOption;
  openingMessage: string;
  isLoading?: boolean;
}

function TypewriterText({ text }: { text: string }) {
  const motionOk = useMotionSafe();
  const [displayed, setDisplayed] = useState("");
  const iRef = useRef(0);

  useEffect(() => {
    if (!text) return;
    if (!motionOk) {
      setDisplayed(text);
      return;
    }
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
  }, [text, motionOk]);

  return (
    <span>
      <span aria-hidden={motionOk}>{displayed}</span>
      {motionOk && displayed.length < text.length && (
        <span className="cursor-blink" aria-hidden>
          |
        </span>
      )}
      <span className="sr-only">{text}</span>
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
  isLoading,
}: PreRaceModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const motionOk = useMotionSafe();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(4px)",
          }}
          initial={motionOk ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={motionOk ? { opacity: 0 } : undefined}
          transition={{ duration: MOTION.fast }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
          role="presentation"
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="prerace-title"
            className="max-w-[900px] w-full rounded overflow-hidden max-h-[80vh] overflow-y-auto outline-none"
            initial={motionOk ? { y: 16, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            exit={motionOk ? { y: 8, opacity: 0 } : undefined}
            transition={{ duration: MOTION.base, ease: MOTION.easeStandard }}
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
                id="prerace-title"
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
                aria-label="Close pre-race brief"
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
              {isLoading ? (
                "Computing strategy options…"
              ) : openingMessage ? (
                <TypewriterText text={openingMessage} />
              ) : (
                "Load a race to generate the strategy brief."
              )}
            </div>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
              <StrategyColumn label="RECOMMENDED" option={recommended} accentBorder />
              <StrategyColumn label="ALTERNATIVE" option={alternative1} />
              <StrategyColumn label="ALTERNATIVE" option={alternative2} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StrategyColumn({
  label,
  option,
  accentBorder,
}: {
  label: string;
  option: StrategyOption;
  accentBorder?: boolean;
}) {
  const plannedStrategy = useRaceStore((s) => s.plannedStrategy);
  const setPlannedStrategy = useRaceStore((s) => s.setPlannedStrategy);
  const hasData = option.compounds.length > 0 && option.compounds[0] !== "—";
  const isPlanned =
    plannedStrategy != null &&
    plannedStrategy.compounds.join() === option.compounds.join() &&
    plannedStrategy.stintLengths.join() === option.stintLengths.join();

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
          fontSize: 11,
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
              aria-hidden
            />
            <span className="sr-only">{c}</span>
            {j < option.compounds.length - 1 && (
              <span style={{ color: "var(--dash-text-muted)", fontSize: 12 }} aria-hidden>
                →
              </span>
            )}
          </span>
        ))}
      </div>
      <div
        className="mb-1 uppercase text-[11px] tracking-wider"
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
        className="mb-1 uppercase text-[11px] tracking-wider"
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
      <button
        type="button"
        onClick={() => setPlannedStrategy(isPlanned ? null : option)}
        disabled={!hasData}
        className="font-display text-[11px] uppercase tracking-[0.1em] px-3 py-1.5 rounded-sm border-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 transition-colors duration-150"
        style={{
          background: isPlanned
            ? "var(--status-gain)"
            : "var(--dash-border-bright)",
          color: isPlanned ? "#0a0a0a" : "var(--dash-text-secondary)",
        }}
      >
        {isPlanned ? "✓ PLAN SET" : "SET AS PLAN"}
      </button>
    </div>
  );
}
