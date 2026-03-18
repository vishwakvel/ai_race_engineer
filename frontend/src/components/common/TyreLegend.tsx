const TYRES = [
  { name: "SOFT", color: "#E8334A" },
  { name: "MED", color: "#F5C518" },
  { name: "HARD", color: "#D8D8D8" },
  { name: "INTER", color: "#39C473" },
  { name: "WET", color: "#4A9FE0" },
];

export function TyreLegend() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        fontFamily: "var(--font-display)",
        fontSize: 10,
        textTransform: "uppercase",
        color: "var(--dash-text-muted)",
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
