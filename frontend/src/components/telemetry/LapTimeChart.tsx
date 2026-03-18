import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { useMemo } from "react";
import { useRaceStore } from "@/store/raceStore";

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "var(--tyre-soft)",
  MEDIUM: "var(--tyre-medium)",
  HARD: "var(--tyre-hard)",
  INTERMEDIATE: "var(--tyre-inter)",
  WET: "var(--tyre-wet)",
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3);
  const [whole, dec] = s.split(".");
  return `${m}:${whole.padStart(2, "0")}.${dec}`;
}

export function LapTimeChart() {
  const allLaps = useRaceStore((s) => s.allLaps);
  const currentLap = useRaceStore((s) => s.currentLap);
  const lstmOutput = useRaceStore((s) => s.lstmOutput);

  const validLapTimes = (allLaps ?? [])
    .map((l) => l.lapTimeSeconds)
    .filter((t) => t > 60 && t < 300)
    .sort((a, b) => a - b);

  const medianLapTime =
    validLapTimes.length > 0
      ? validLapTimes[Math.floor(validLapTimes.length / 2)] ?? 92
      : 92;

  const rawLaps = (allLaps ?? [])
    .filter((l) => l.lapNumber <= currentLap)
    .filter(
      (l) =>
        l.lapTimeSeconds > medianLapTime * 0.85 &&
        l.lapTimeSeconds < medianLapTime * 1.2
    )
    .sort((a, b) => a.lapNumber - b.lapNumber);

  const { chartRows, stintMeta, transitions } = useMemo(() => {
    if (rawLaps.length === 0) {
      return {
        chartRows: [],
        stintMeta: [],
        transitions: [] as { lap: number; label: string }[],
      };
    }
    const trans: { lap: number; label: string }[] = [];
    let stintIdx = 0;
    const meta: { compound: string }[] = [
      { compound: rawLaps[0]!.compoundStr || "MEDIUM" },
    ];
    const rows: Record<string, number | string | boolean | undefined>[] = [];

    rawLaps.forEach((l, i) => {
      if (i > 0) {
        const prev = rawLaps[i - 1]!;
        if (l.compoundStr !== prev.compoundStr) {
          stintIdx += 1;
          meta.push({ compound: l.compoundStr || "MEDIUM" });
          trans.push({
            lap: l.lapNumber,
            label: `${prev.compoundStr || "—"} → ${l.compoundStr || "—"}`,
          });
        }
      }
      const key = `s${stintIdx}`;
      const row: Record<string, number | string | boolean | undefined> = {
        lap: l.lapNumber,
        compound: l.compoundStr,
        tyreAge: l.tyreAge,
        pitted: l.pittedThisLap,
      };
      row[key] = parseFloat(l.lapTimeSeconds.toFixed(3));
      rows.push(row);
    });

    return {
      chartRows: rows,
      stintMeta: meta,
      transitions: trans,
    };
  }, [rawLaps]);

  const hasData = chartRows.length > 0;
  const numStints = stintMeta.length || 1;

  const fastest = hasData
    ? Math.min(
        ...chartRows.flatMap((r) =>
          Object.keys(r)
            .filter((k) => k.startsWith("s"))
            .map((k) => r[k] as number)
            .filter((v) => typeof v === "number")
        )
      )
    : 0;
  const lastRow = hasData ? chartRows[chartRows.length - 1]! : null;
  let currentLapTime = 0;
  if (lastRow) {
    for (let s = numStints - 1; s >= 0; s--) {
      const v = lastRow[`s${s}`];
      if (typeof v === "number") {
        currentLapTime = v;
        break;
      }
    }
  }

  const predictedLapTime = lstmOutput?.predictedLapTime;

  if (!hasData) {
    return (
      <div
        className="rounded flex items-center justify-center min-h-[240px]"
        style={{
          background: "var(--dash-elevated)",
          opacity: 0.4,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--dash-text-muted)",
          }}
        >
          AWAITING DATA
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartRows}
            margin={{ top: 26, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="var(--dash-border)"
              vertical={false}
            />
            <XAxis
              dataKey="lap"
              tick={{
                fontFamily: "var(--font-display)",
                fontSize: 11,
                fill: "var(--dash-text-secondary)",
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fill: "var(--dash-text-secondary)",
              }}
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
              tickFormatter={(v) => String(v)}
            />
            <Tooltip
              contentStyle={{
                background: "var(--dash-elevated)",
                border: "1px solid var(--dash-border-bright)",
                borderRadius: 4,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
              labelStyle={{ fontFamily: "var(--font-display)" }}
              formatter={(value: number) => [value.toFixed(3), "Time (s)"]}
              labelFormatter={(lapNumber, payload) => {
                const p = payload[0]?.payload;
                if (!p) return `Lap ${lapNumber}`;
                return `Lap ${lapNumber} · ${p.compound} · tyre age ${p.tyreAge}`;
              }}
            />
            <ReferenceLine
              y={medianLapTime}
              stroke="var(--dash-text-muted)"
              strokeDasharray="4 4"
            />
            <ReferenceArea
              y1={medianLapTime - 0.5}
              y2={medianLapTime + 0.5}
              fill="rgba(228, 3, 46, 0.05)"
            />
            {transitions.map((t) => (
              <ReferenceLine
                key={`${t.lap}-${t.label}`}
                x={t.lap}
                stroke="var(--ferrari-red)"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{
                  value: t.label,
                  position: "insideTop",
                  fill: "var(--ferrari-red)",
                  fontSize: 9,
                  fontWeight: 700,
                  offset: 6,
                }}
              />
            ))}
            {Array.from({ length: numStints }, (_, s) => {
              const compound = stintMeta[s]?.compound ?? "MEDIUM";
              const stroke =
                COMPOUND_COLORS[compound] ?? "var(--tyre-medium)";
              return (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={`s${s}`}
                  stroke={stroke}
                  strokeWidth={2.5}
                  dot={{ r: 2, fill: stroke, strokeWidth: 0 }}
                  connectNulls
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div
        className="flex gap-6 mt-3 flex-wrap"
        style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
      >
        <span style={{ color: "var(--status-gain)" }}>
          FASTEST&nbsp;&nbsp;{formatTime(fastest)}
        </span>
        <span style={{ color: "var(--dash-text-primary)" }}>
          CURRENT&nbsp;&nbsp;{formatTime(currentLapTime)}
        </span>
        {predictedLapTime != null && predictedLapTime > 0 && (
          <span style={{ color: "var(--sky-blue)" }}>
            PREDICTED&nbsp;&nbsp;{formatTime(predictedLapTime)}
          </span>
        )}
      </div>
    </div>
  );
}
