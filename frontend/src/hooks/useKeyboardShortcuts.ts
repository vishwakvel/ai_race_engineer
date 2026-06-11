import { useEffect } from "react";

export interface KeyboardShortcutHandlers {
  onPrevLap?: () => void;
  onNextLap?: () => void;
  onTogglePlay?: () => void;
  onToggleRaceMode?: () => void;
  onSpeed1?: () => void;
  onSpeed2?: () => void;
  onSpeed5?: () => void;
  onPreRaceBrief?: () => void;
}

/** Pit-wall keyboard map — active only when focus is not in a form field. */
export function useKeyboardShortcuts(
  handlers: KeyboardShortcutHandlers,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlers.onPrevLap?.();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        handlers.onNextLap?.();
        return;
      }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        handlers.onToggleRaceMode?.();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        handlers.onToggleRaceMode?.();
        return;
      }
      if (e.key === "1") {
        handlers.onSpeed1?.();
        return;
      }
      if (e.key === "2") {
        handlers.onSpeed2?.();
        return;
      }
      if (e.key === "5") {
        handlers.onSpeed5?.();
        return;
      }
      if (e.key === "b" || e.key === "B") {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        handlers.onPreRaceBrief?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, handlers]);
}
