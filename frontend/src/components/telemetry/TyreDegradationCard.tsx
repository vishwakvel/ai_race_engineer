import { AreaChart, Area, XAxis, YAxis, ReferenceLine, ResponsiveContainer } from "recharts";
import { useRaceStore } from "@/store/raceStore";
import { TyreLegend } from "@/components/common/TyreLegend";
import { COMPOUND_COLORS } from "@/design/tokens";
import { EmptyState } from "@/components/ui/EmptyState";

export function TyreDegradationCard() {
  const allLaps = useRaceStore((s) => s.allLaps) ?? [];
  const currentLap = useRaceStore((s) => s.currentLap);
  const lstmOutput = useRaceStore((s) => s.lstmOutput);

  const currentLapData = allLaps.find((l) => l.lapNumber === currentLap);
  const currentCompound = currentLapData?.compoundStr ?? "MEDIUM";
  const tyreAge = currentLapData?.tyreAge ?? 0;
  const cliffProb = lstmOutput?.cliffProb ?? 0;

  const compoundColor = COMPOUND_COLORS[currentCompound] ?? COMPOUND_COLORS.MEDIUM!;
  const cliffPct = Math.round(cliffProb * 100);
  const cliffColor =
    cliffPct > 30 ? "var(--status-loss)" : cliffPct > 15 ? "var(--status-warn)" : "var(--dash-text-muted)";

  let stintStartIdx = allLaps.findIndex((l) => l.lapNumber === currentLap);
  if (stintStartIdx < 0) stintStartIdx = 0;
  while (stintStartIdx > 0) {
    const prev = allLaps[stintStartIdx - 1];
    if (prev.compoundStr !== currentCompound || prev.pittedThisLap) break;
    stintStartIdx--;
  }

  const stintLaps = allLaps
    .slice(stintStartIdx)
    .filter((l) => l.lapNumber <= currentLap)
    .filter((l) => !l.safetyCarActive && !l.isInlap && !l.isOutlap)
    .filter((l) => l.lapTimeSeconds > 60 && l.lapTimeSeconds < 200);

  const baseline = stintLaps[0]?.lapTimeSeconds ?? null;

  const chartData = stintLaps.map((l) => ({
    lap: l.lapNumber,
    age: l.tyreAge,
    delta: baseline ? parseFloat((l.lapTimeSeconds - baseline).toFixed(2)) : 0,
  }));

  const hasData = currentLap > 0 && currentLapData != null && chartData.length > 0;

  if (!hasData) {
    return <EmptyState label="AWAITING DATA" minHeight={160} />;
  }

  return (
    <div>
      <div
        className="flex items-center justify-between gap-2 flex-wrap mb-4"
        style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: compoundColor }}
          />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 14,
              textTransform: "uppercase",
              color: "var(--dash-text-primary)",
            }}
          >
            {currentCompound}
          </span>
          <span style={{ color: "var(--dash-text-secondary)" }}>·</span>
          <span style={{ color: "var(--dash-text-primary)" }}>{tyreAge} LAPS</span>
          <span style={{ color: "var(--dash-text-secondary)" }}>·</span>
          <span style={{ color: cliffColor }}>CLIFF {cliffPct}%</span>
        </div>
        <TyreLegend />
      </div>

      <div className="h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="degGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={compoundColor} stopOpacity={0.4} />
                <stop offset="100%" stopColor={compoundColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="lap"
              tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--dash-text-secondary)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--dash-text-secondary)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1))}
              label={{
                value: "+Xs vs lap 1",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 10, fill: "var(--dash-text-muted)" },
              }}
            />
            <ReferenceLine y={0} stroke="var(--dash-border-bright)" strokeDasharray="2 2" />
            <Area
              type="monotone"
              dataKey="delta"
              fill={`url(#degGrad)`}
              stroke={compoundColor}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
