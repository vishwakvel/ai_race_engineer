import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRaceStore } from "@/store/raceStore";
import { COMPOUND_COLORS, FERRARI_RED } from "@/design/tokens";
import { MOTION } from "@/design/motion";
import { useMotionSafe } from "@/hooks/useMotionSafe";

export function BoxBoxBanner() {
  const pitEvents = useRaceStore((s) => s.pitEvents);
  const [visible, setVisible] = useState<{
    compound: string;
    lap: number;
  } | null>(null);
  const prevLengthRef = useRef(0);
  const prevLapRef = useRef<number | null>(null);
  const motionOk = useMotionSafe();

  useEffect(() => {
    const latest = pitEvents[pitEvents.length - 1];
    const newEvent =
      pitEvents.length > prevLengthRef.current ||
      (latest && latest.lap !== prevLapRef.current);

    if (newEvent && latest) {
      prevLengthRef.current = pitEvents.length;
      prevLapRef.current = latest.lap;
      setVisible({ compound: latest.compound, lap: latest.lap });
    }
  }, [pitEvents]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(null), 3000);
    return () => clearTimeout(timer);
  }, [visible]);

  const color =
    COMPOUND_COLORS[visible?.compound.toUpperCase() ?? ""] ?? FERRARI_RED;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`${visible.lap}-${visible.compound}`}
          role="status"
          aria-live="assertive"
          initial={motionOk ? { y: -72, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          exit={motionOk ? { y: -48, opacity: 0 } : { opacity: 0 }}
          transition={{
            duration: motionOk ? MOTION.base : 0,
            ease: MOTION.easeStandard,
          }}
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              {visible.compound.toUpperCase()}
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
            LAP {visible.lap}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
