import type { ReactNode } from "react";
import clsx from "clsx";

interface PanelProps {
  /** Uppercase panel title. Accepts nodes for status suffixes (e.g. FALLBACK). */
  title: ReactNode;
  /** Right-aligned slot in the header row. */
  action?: ReactNode;
  /** Compact density tightens paddings for embedded contexts (e.g. track map). */
  density?: "comfortable" | "compact";
  className?: string;
  children: ReactNode;
}

/**
 * Standard dashboard card: surface background, hairline border, uppercase
 * ruled title. The single source for card anatomy across the dashboard.
 */
export function Panel({
  title,
  action,
  density = "comfortable",
  className,
  children,
}: PanelProps) {
  const compact = density === "compact";
  return (
    <section
      className={clsx(
        "rounded bg-dash-surface border border-dash-border",
        compact ? "px-4 py-3" : "px-5 py-4",
        className
      )}
    >
      <header
        className={clsx(
          "flex items-start justify-between gap-3 border-b border-dash-border",
          compact ? "pb-2 mb-2" : "pb-3 mb-4"
        )}
      >
        <h3
          className={clsx(
            "m-0 font-display font-semibold uppercase tracking-[0.2em] text-dash-text-secondary",
            compact ? "text-[10px]" : "text-[11px]"
          )}
        >
          {title}
        </h3>
        {action != null && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}
