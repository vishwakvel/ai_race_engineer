import { useEffect, useState } from "react";

/** Respects `prefers-reduced-motion: reduce` for animation gating. */
export function useMotionSafe(): boolean {
  const [motionOk, setMotionOk] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setMotionOk(!mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return motionOk;
}
