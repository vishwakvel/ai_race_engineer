import { useEffect, useMemo, useState } from "react";
import { useRaceStore } from "@/store/raceStore";
import { apiClient, type TrackMapData } from "@/api/client";

const CIRCUIT_NAMES: Record<string, string> = {
  sakhir: "Bahrain",
  bahrain: "Bahrain",
  monaco: "Monaco",
  silverstone: "Silverstone",
  monza: "Monza",
  spa: "Spa",
  suzuka: "Suzuka",
  melbourne: "Melbourne",
  budapest: "Budapest",
  yas_island: "Abu Dhabi",
  yas_marina: "Abu Dhabi",
  jeddah: "Saudi Arabia",
  baku: "Baku",
  marina_bay: "Singapore",
  zandvoort: "Zandvoort",
  lusail: "Qatar",
  austin: "Austin",
  mexico_city: "Mexico City",
  las_vegas: "Las Vegas",
};

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#E8334A",
  MEDIUM: "#F5C518",
  HARD: "#D8D8D8",
  INTERMEDIATE: "#39C473",
  WET: "#4A9FE0",
};

const FALLBACK_PATH =
  "M 200 40 Q 360 40 360 150 Q 360 260 200 260 Q 40 260 40 150 Q 40 40 200 40 Z";
const FALLBACK_VIEWBOX = "0 0 400 300";

function pointsToPath(points: [number, number][]): string {
  if (!points || points.length < 2) return FALLBACK_PATH;
  const [first, ...rest] = points;
  let d = `M ${first[0]} ${first[1]}`;
  for (const p of rest) {
    d += ` L ${p[0]} ${p[1]}`;
  }
  return d;
}

function buildArcLengths(pts: [number, number][]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    out.push(out[i - 1]! + Math.hypot(dx, dy));
  }
  return out;
}

function pointAtDistance(
  pts: [number, number][],
  arc: number[],
  dist: number
): { x: number; y: number } | null {
  if (pts.length < 2 || arc.length !== pts.length) return null;
  const total = arc[arc.length - 1] ?? 0;
  if (total <= 0) return { x: pts[0]![0], y: pts[0]![1] };
  const d = Math.max(0, Math.min(total, dist));
  let i1 = 1;
  while (i1 < arc.length && (arc[i1] ?? 0) < d) i1++;
  const i0 = Math.max(0, i1 - 1);
  const a0 = arc[i0] ?? 0;
  const a1 = arc[i1] ?? a0;
  const t = a1 > a0 ? (d - a0) / (a1 - a0) : 0;
  const p0 = pts[i0]!;
  const p1 = pts[Math.min(i1, pts.length - 1)]!;
  return { x: p0[0] + t * (p1[0] - p0[0]), y: p0[1] + t * (p1[1] - p0[1]) };
}

function pointsUpToDistance(
  pts: [number, number][],
  arc: number[],
  dist: number
): [number, number][] {
  if (pts.length < 2 || arc.length !== pts.length) return [];
  const total = arc[arc.length - 1] ?? 0;
  if (total <= 0) return [];
  const d = Math.max(0, Math.min(total, dist));
  let i1 = 1;
  while (i1 < arc.length && (arc[i1] ?? 0) < d) i1++;
  const head = pts.slice(0, Math.min(i1 + 1, pts.length));
  const p = pointAtDistance(pts, arc, d);
  if (p && head.length > 0) {
    head[head.length - 1] = [p.x, p.y];
  }
  return head;
}

type TrackMapProps = {
  embedded?: boolean;
  compactSquare?: boolean;
};

export function TrackMap({
  embedded = false,
  compactSquare = false,
}: TrackMapProps = {}) {
  const allLaps = useRaceStore((s) => s.allLaps);
  const currentLap = useRaceStore((s) => s.currentLap);
  const totalLapsStore = useRaceStore((s) => s.totalLaps);
  const lapElapsedSeconds = useRaceStore((s) => s.lapElapsedSeconds);

  const [trailPositions, setTrailPositions] = useState<{ x: number; y: number }[]>(
    []
  );
  const [trackData, setTrackData] = useState<TrackMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const circuitId = allLaps[0]?.circuitId ? String(allLaps[0].circuitId) : "";

  const circuitName =
    CIRCUIT_NAMES[circuitId.toLowerCase().replace(/-/g, "_")] ??
    (circuitId.replace(/_/g, " ").toUpperCase() || "Circuit");

  const maxLapNum =
    allLaps.length > 0
      ? Math.max(...allLaps.map((l) => l.lapNumber))
      : 1;
  void totalLapsStore;
  void maxLapNum;

  const path = trackData?.points?.length
    ? pointsToPath(trackData.points as [number, number][])
    : FALLBACK_PATH;
  const viewBox = trackData?.viewBox ?? FALLBACK_VIEWBOX;

  const currentLapData = allLaps.find((l) => l.lapNumber === currentLap);
  const compound = currentLapData?.compoundStr ?? "MEDIUM";
  const carColor = COMPOUND_COLORS[compound] ?? "#E4032E";
  const lapDur =
    currentLapData &&
    currentLapData.lapTimeSeconds > 20 &&
    currentLapData.lapTimeSeconds < 400
      ? currentLapData.lapTimeSeconds
      : 92;
  const lapProgress01 = lapDur > 0 ? lapElapsedSeconds / lapDur : 0;

  const pts = useMemo(
    () => (trackData?.points as [number, number][]) ?? [],
    [trackData]
  );

  const arc = useMemo(() => (pts.length >= 2 ? buildArcLengths(pts) : []), [pts]);

  const carPos = useMemo(() => {
    if (pts.length < 2 || currentLap < 0) return null;
    const totalLen = arc[arc.length - 1] ?? 0;
    const d = Math.max(0, Math.min(1, lapProgress01)) * totalLen;
    return pointAtDistance(pts, arc, d);
  }, [pts, arc, currentLap, lapProgress01]);

  useEffect(() => {
    setTrailPositions([]);
  }, [currentLap]);

  useEffect(() => {
    if (carPos) {
      setTrailPositions((prev) => [...prev.slice(-12), carPos]);
    }
  }, [carPos?.x, carPos?.y]);

  useEffect(() => {
    if (!circuitId || circuitId === "") {
      setTrackData(null);
      setError(false);
      setLoading(false);
      setTrailPositions([]);
      return;
    }
    setLoading(true);
    setError(false);
    setTrackData(null);
    setTrailPositions([]);

    apiClient
      .getTrackMap(circuitId)
      .then((data) => {
        setTrackData(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [circuitId]);

  const completedPoints =
    pts.length >= 2 && currentLap >= 0 && lapProgress01 > 0
      ? pointsUpToDistance(
          pts,
          arc,
          Math.max(0, Math.min(1, lapProgress01)) * (arc[arc.length - 1] ?? 0)
        )
      : [];
  const startFinishPoint = trackData?.points?.[0] as [number, number] | undefined;

  const shellStyle =
    compactSquare || embedded
      ? {
          background: "var(--dash-surface)",
          border: compactSquare ? "1px solid var(--dash-border)" : "none",
          borderRadius: compactSquare ? 4 : 0,
          padding: compactSquare ? "12px 16px" : "16px 20px",
          height: "100%",
          width: "100%",
          display: "flex" as const,
          flexDirection: "column" as const,
          minHeight: 0,
          minWidth: 0,
          boxSizing: "border-box" as const,
        }
      : {
          background: "var(--dash-surface)",
          border: "1px solid var(--dash-border)",
          borderRadius: 4,
          padding: "20px 24px",
        };

  if (!circuitId) {
    return (
      <div style={shellStyle}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: "var(--dash-text-secondary)",
            borderBottom: "1px solid var(--dash-border)",
            paddingBottom: 12,
            marginBottom: 16,
          }}
        >
          CIRCUIT MAP
        </div>
        <div
          className="flex items-center justify-center flex-1 min-h-[160px]"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--dash-text-muted)",
          }}
        >
          SELECT A RACE
        </div>
      </div>
    );
  }

  const sec = Math.min(lapElapsedSeconds, Math.floor(lapDur));
  const secStr = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const durStr = `${Math.floor(lapDur / 60)}:${String(Math.floor(lapDur % 60)).padStart(2, "0")}`;

  return (
    <div style={shellStyle}>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: compactSquare ? 10 : 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "var(--dash-text-secondary)",
          borderBottom: "1px solid var(--dash-border)",
          paddingBottom: compactSquare ? 8 : 12,
          marginBottom: compactSquare ? 8 : 16,
        }}
      >
        {circuitName.toUpperCase()}
        {error && (
          <span
            style={{
              marginLeft: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--status-warn)",
            }}
          >
            FALLBACK
          </span>
        )}
        {loading && (
          <span
            style={{
              marginLeft: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--dash-text-muted)",
            }}
          >
            …
          </span>
        )}
      </div>

      <div
        className={
          compactSquare || embedded
            ? "flex-1 min-h-0 flex items-center justify-center"
            : ""
        }
        style={{ minWidth: 0, width: "100%" }}
      >
        <svg
          width="100%"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          style={{
            display: "block",
            maxHeight: compactSquare ? "100%" : embedded ? "100%" : 280,
            width: "100%",
          }}
        >
          <path
            d={path}
            fill="none"
            stroke="rgba(228, 3, 46, 0.06)"
            strokeWidth={14}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={path}
            fill="none"
            stroke="#1A1A35"
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={path}
            fill="none"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {completedPoints.length > 1 && (
            <path
              d={pointsToPath(completedPoints)}
              fill="none"
              stroke="rgba(228, 3, 46, 0.28)"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {startFinishPoint && (
            <line
              x1={startFinishPoint[0] - 4}
              y1={startFinishPoint[1]}
              x2={startFinishPoint[0] + 4}
              y2={startFinishPoint[1]}
              stroke="#E4032E"
              strokeWidth={2}
            />
          )}
          {trailPositions.map((pos, i) => {
            const opacities = [0.06, 0.1, 0.18, 0.28, 0.4, 0.5, 0.55, 0.6];
            const o = opacities[trailPositions.length - 1 - i] ?? 0.05;
            return (
              <circle
                key={`${pos.x}-${pos.y}-${i}`}
                cx={pos.x}
                cy={pos.y}
                r={2.5}
                fill={carColor}
                opacity={o}
              />
            );
          })}
          {carPos && (
            <>
              <circle
                cx={carPos.x}
                cy={carPos.y}
                r={6}
                fill={carColor}
                stroke="white"
                strokeWidth={1.5}
              />
              <circle
                cx={carPos.x}
                cy={carPos.y}
                r={10}
                fill={carColor}
                opacity={0.2}
              />
            </>
          )}
        </svg>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginTop: compactSquare ? 8 : 12,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: carColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: compactSquare ? 9 : 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--dash-text-secondary)",
            }}
          >
            LAP {currentLap} · {compound}
          </span>
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: compactSquare ? 10 : 11,
            color: "var(--dash-text-muted)",
          }}
        >
          {secStr} / {durStr}
        </span>
      </div>
    </div>
  );
}
