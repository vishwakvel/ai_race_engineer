import type { ReactNode } from "react";
import clsx from "clsx";

interface EmptyStateProps {
  /** Short uppercase status line, e.g. "AWAITING DATA". */
  label: ReactNode;
  minHeight?: number;
  className?: string;
}

/** Unified empty/idle placeholder used by all data panels. */
export function EmptyState({ label, minHeight = 160, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "rounded flex items-center justify-center bg-dash-elevated opacity-40",
        className
      )}
      style={{ minHeight }}
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-dash-text-muted text-center px-6">
        {label}
      </span>
    </div>
  );
}
