import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer } from "recharts";
import { useRaceStore } from "@/store/raceStore";
import type { FinishingDistribution } from "@/types";

const POS_COLORS: Record<string, string> = {
  P1: "#FFD700",
  P2: "#C0C0C0",
  P3: "#CD7F32",
  P4: "var(--sky-blue)",
  P5: "var(--sky-blue)",
  P6: "var(--sky-blue)",
  P7: "var(--dash-text-muted)",
  P8: "var(--dash-text-muted)",
  P9: "var(--dash-text-muted)",
  P10: "var(--dash-text-muted)",
  "P11+": "var(--dash-text-muted)",
};

export function PositionDistribution() {
  const ppo = useRaceStore((s) => s.ppoOutput);
  const distribution: FinishingDistribution = ppo?.finishingDistribution ?? {};
  const medianPosition = ppo?.medianFinish ?? 0;
  const p10 = ppo?.p10Finish ?? 0;
  const p90 = ppo?.p90Finish ?? 0;
  const hasData = Object.keys(distribution).length > 0;

  const bars = [
    "P1",
    "P2",
    "P3",
    "P4",
    "P5",
    "P6",
    "P7",
    "P8",
    "P9",
    "P10",
    "P11+",
  ].map((label) => ({
    name: label,
    value: label === "P11+" 
      ? (distribution["P11"] ?? 0) + (distribution["P12"] ?? 0) + (distribution["P13"] ?? 0) + (distribution["P14"] ?? 0) + (distribution["P15"] ?? 0) + (distribution["P16"] ?? 0) + (distribution["P17"] ?? 0) + (distribution["P18"] ?? 0) + (distribution["P19"] ?? 0) + (distribution["P20"] ?? 0)
      : distribution[label] ?? 0,
  }));

  if (!hasData) {
    return (
      <div className="space-y-2">
        <div
          className="flex gap-1 items-end h-24"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {[0.15, 0.25, 0.4, 0.35, 0.2, 0.18, 0.12, 0.08, 0.05, 0.03, 0.02].map((w, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm min-w-0"
              style={{
                height: `${w * 100}%`,
                background: "var(--dash-elevated)",
                opacity: 0.6,
              }}
            />
          ))}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--dash-text-muted)",
          }}
        >
          MEDIAN P— · RANGE P— – P—
        </div>
      </div>
    );
  }

  const medianLabel = medianPosition ? `P${medianPosition}` : "P—";

  return (
    <div>
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={bars}
            layout="vertical"
            margin={{ top: 4, right: 8, left: 28, bottom: 4 }}
          >
            <XAxis
              type="number"
              domain={[0, 1]}
              tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--dash-text-secondary)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={24}
              tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--dash-text-secondary)" }}
              axisLine={false}
              tickLine={false}
            />
            <Bar dataKey="value" radius={0} isAnimationActive={false} minPointSize={2}>
              {bars.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={POS_COLORS[entry.name] ?? "var(--dash-text-muted)"}
                  stroke={entry.name === medianLabel ? "white" : "none"}
                  strokeWidth={1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--dash-text-secondary)",
        }}
      >
        MEDIAN {medianLabel} · RANGE P{p10 || "—"} – P{p90 || "—"}
      </div>
    </div>
  );
}
