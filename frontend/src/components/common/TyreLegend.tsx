import { COMPOUND_COLORS, COMPOUND_LABELS } from "@/design/tokens";

const TYRES = (["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const).map(
  (key) => ({ name: COMPOUND_LABELS[key]!, color: COMPOUND_COLORS[key]! })
);

export function TyreLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: compact ? "wrap" : "nowrap",
        alignItems: "center",
        gap: compact ? 6 : 16,
        fontFamily: "var(--font-display)",
        fontSize: compact ? 8 : 10,
        textTransform: "uppercase",
        color: "var(--dash-text-muted)",
        marginTop: compact ? 6 : 0,
      }}
    >
      {TYRES.map((t) => (
        <div
          key={t.name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg width={8} height={8} viewBox="0 0 8 8">
            <circle cx={4} cy={4} r={4} fill={t.color} />
          </svg>
          <span>{t.name}</span>
        </div>
      ))}
    </div>
  );
}
