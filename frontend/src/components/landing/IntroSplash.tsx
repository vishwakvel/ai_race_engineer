import { useEffect, useRef } from "react";
import gsap from "gsap";

interface IntroSplashProps {
  onComplete: () => void;
  motionOk: boolean;
}

export function IntroSplash({ onComplete, motionOk }: IntroSplashProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const text = textRef.current;
    if (!overlay || !text) return;

    if (!motionOk) {
      overlay.style.display = "none";
      onComplete();
      return;
    }

    const tl = gsap.timeline({
      onComplete: () => {
        overlay.style.display = "none";
        onComplete();
      },
    });

    tl.fromTo(
      text,
      { opacity: 0, scale: 0.88 },
      { opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" }
    )
      .to(text, { duration: 1.2 })
      .to(overlay, { opacity: 0, duration: 0.65, ease: "power2.inOut" });

    return () => {
      tl.kill();
    };
  }, [motionOk, onComplete]);

  if (!motionOk) return null;

  return (
    <div
      ref={overlayRef}
      className="intro-splash"
      aria-hidden="true"
      role="presentation"
    >
      <div ref={textRef} className="intro-splash__text">
        LECLERCAI
      </div>
    </div>
  );
}
