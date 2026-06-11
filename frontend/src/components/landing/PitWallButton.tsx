import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useMotionSafe } from "@/hooks/useMotionSafe";

const LOGO = "/logo.png";
const NAVIGATE_MS = 680;
const RESET_MS = 980;

interface PitWallButtonProps {
  onNavigate: () => void;
}

export function PitWallButton({ onNavigate }: PitWallButtonProps) {
  const motionOk = useMotionSafe();
  const btnRef = useRef<HTMLButtonElement>(null);
  const timersRef = useRef<number[]>([]);
  const [knobTravel, setKnobTravel] = useState(0);
  const [active, setActive] = useState(false);
  const [instantReset, setInstantReset] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const el = btnRef.current;
      if (!el) return;
      const knob = el.querySelector<HTMLElement>(".pit-wall-btn__knob");
      if (!knob) return;
      const pad = 5;
      setKnobTravel(el.offsetWidth - knob.offsetWidth - pad * 2);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    const hero = document.querySelector("#hero-section");
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
          setInstantReset(true);
          setActive(false);
          requestAnimationFrame(() => setInstantReset(false));
        }
      },
      { threshold: [0, 0.45] }
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  const resetIdle = useCallback(() => {
    setInstantReset(true);
    setActive(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setInstantReset(false));
    });
  }, []);

  const handleClick = useCallback(() => {
    if (active) return;

    if (!motionOk) {
      onNavigate();
      return;
    }

    setActive(true);

    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [
      window.setTimeout(onNavigate, NAVIGATE_MS),
      window.setTimeout(resetIdle, RESET_MS),
    ];
  }, [active, motionOk, onNavigate, resetIdle]);

  return (
    <button
      ref={btnRef}
      type="button"
      className={clsx(
        "pit-wall-btn",
        active && "pit-wall-btn--active",
        instantReset && "pit-wall-btn--instant"
      )}
      style={{ "--knob-travel": `${knobTravel}px` } as React.CSSProperties}
      onClick={handleClick}
      aria-label="Open pit wall dashboard"
      disabled={active}
    >
      <span className="pit-wall-btn__knob" aria-hidden="true">
        <img src={LOGO} alt="" draggable={false} />
      </span>
      <span className="pit-wall-btn__label">OPEN PIT WALL</span>
    </button>
  );
}
