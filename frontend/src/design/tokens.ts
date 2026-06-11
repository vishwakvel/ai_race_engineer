/**
 * Design tokens — single source of truth for values consumed from JS/TSX
 * (charts, SVG attributes, framer-motion). CSS consumers use the custom
 * properties in `index.css`, which mirror these values exactly.
 */

/** FIA tyre compound colors. Keys match `LapData.compoundStr`. */
export const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#E8334A",
  MEDIUM: "#F5C518",
  HARD: "#D8D8D8",
  INTERMEDIATE: "#39C473",
  WET: "#4A9FE0",
  UNKNOWN: "#555577",
};

/** Safe lookup — tolerates lowercase, legacy names, and missing values. */
export function compoundColor(
  compound: string | undefined | null,
  fallback: string = COMPOUND_COLORS.UNKNOWN!
): string {
  if (!compound) return fallback;
  return COMPOUND_COLORS[compound.toUpperCase()] ?? fallback;
}

/** Short display labels for compounds (legend, chips). */
export const COMPOUND_LABELS: Record<string, string> = {
  SOFT: "SOFT",
  MEDIUM: "MED",
  HARD: "HARD",
  INTERMEDIATE: "INTER",
  WET: "WET",
};

/** Status / state colors (mirror --status-* custom properties). */
export const STATUS_COLORS = {
  gain: "#22C55E",
  loss: "#EF4444",
  warn: "#F59E0B",
  urgent: "#FF5722",
  sc: "#FF9800",
} as const;

/** Brand */
export const FERRARI_RED = "#E4032E";
export const SKY_BLUE = "#95C4EB";
