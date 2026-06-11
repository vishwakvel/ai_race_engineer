import { useEffect, useRef } from "react";

/** Custom red dot cursor for landing sections (desktop only). */
export function LandingCursor({ active }: { active: boolean }) {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;

    const dot = dotRef.current;
    if (!dot) return;

    const onMove = (e: MouseEvent) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const interactive = target?.closest("a, button, [role='button']");
      dot.classList.toggle("is-hover", Boolean(interactive));
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseover", onOver);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
    };
  }, [active]);

  if (!active) return null;

  return <div ref={dotRef} className="landing-cursor-dot" aria-hidden="true" />;
}
