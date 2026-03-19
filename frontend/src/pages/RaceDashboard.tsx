import { LapTimeChart } from "@/components/telemetry/LapTimeChart";
import { TyreDegradationCard } from "@/components/telemetry/TyreDegradationCard";
import { StrategyTimeline } from "@/components/strategy/StrategyTimeline";
import { TyreLegend } from "@/components/common/TyreLegend";
import { TrackMap } from "@/components/track/TrackMap";
import { EngineerPanel } from "@/components/engineer/EngineerPanel";
import { RaceSelectionCard } from "@/components/dashboard/RaceSelectionCard";
import { PreRaceModal } from "@/components/engineer/PreRaceModal";
import { useRaceStore } from "@/store/raceStore";
import { useRaceReplay } from "@/hooks/useRaceReplay";
import type { StintSegment } from "@/components/strategy/StrategyTimeline";
import type { LapData } from "@/types";

const CARD_HEADER_STYLE = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: "0.2em",
  color: "var(--dash-text-secondary)",
  textTransform: "uppercase" as const,
  borderBottom: "1px solid var(--dash-border)",
  paddingBottom: 12,
  marginBottom: 16,
};

const CTRL_BTN: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--dash-border)",
  color: "var(--dash-text-primary)",
  fontFamily: "var(--font-display)",
  fontSize: 11,
  textTransform: "uppercase",
  borderRadius: 2,
  padding: "12px 14px",
  letterSpacing: "0.06em",
  cursor: "pointer",
  width: "100%",
};

const CTRL_SELECT: React.CSSProperties = {
  ...CTRL_BTN,
  padding: "12px 14px",
  appearance: "auto",
  width: "100%",
};

const RADIO_CARD_RADIUS = 4;

/** Header h-14 = 56px */
const HEADER_HEIGHT_PX = 56;
/** Extra height below viewport so team radio (full grid height) extends further down */
const TEAM_RADIO_EXTEND_BELOW_VH_PX = 900;

function DashCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded overflow-hidden"
      style={{
        background: "var(--dash-surface)",
        border: "1px solid var(--dash-border)",
        borderRadius: RADIO_CARD_RADIUS,
        padding: "20px 24px",
      }}
    >
      <div style={CARD_HEADER_STYLE}>{title}</div>
      {children}
    </div>
  );
}

const PLACEHOLDER_STRATEGY = {
  compounds: ["—"] as string[],
  stintLengths: [0] as number[],
  expectedPosition: 0,
  rationale: "Load a race for strategy options.",
};

function buildStints(laps: LapData[]): StintSegment[] {
  if (!laps || laps.length === 0) return [];

  const sorted = [...laps].sort((a, b) => a.lapNumber - b.lapNumber);
  const stints: StintSegment[] = [];
  let currentStint: StintSegment | null = null;

  for (const lap of sorted) {
    if (!currentStint || lap.compoundStr !== currentStint.compound) {
      if (currentStint) stints.push(currentStint);
      currentStint = {
        startLap: lap.lapNumber,
        endLap: lap.lapNumber,
        compound: lap.compoundStr || "MEDIUM",
        length: 1,
      };
    } else {
      currentStint.endLap = lap.lapNumber;
      currentStint.length++;
    }
  }
  if (currentStint) stints.push(currentStint);
  return stints;
}

function formatClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function RaceDashboard() {
  const preRaceOpen = useRaceStore((s) => s.preRaceModalOpen);
  const setPreRaceOpen = useRaceStore((s) => s.setPreRaceModalOpen);
  const raceLoaded = useRaceStore((s) => s.raceLoaded);
  const allLaps = useRaceStore((s) => s.allLaps) ?? [];
  const currentLap = useRaceStore((s) => s.currentLap);
  const totalLapsStore = useRaceStore((s) => s.totalLaps);
  const ppoOutput = useRaceStore((s) => s.ppoOutput);
  const lapElapsedSeconds = useRaceStore((s) => s.lapElapsedSeconds);

  const replay = useRaceReplay();
  const {
    totalLaps: replayTotal,
    lastDataLap,
    isPlaying,
    isLoading,
    playbackSpeed,
    currentLapDuration,
    nextLap,
    prevLap,
    toggleAutoPlay,
    setPlaybackSpeed,
  } = replay;

  const stints =
    raceLoaded && allLaps.length > 0 ? buildStints(allLaps) : [];
  const timelineTotal =
    totalLapsStore > 0 ? totalLapsStore : replayTotal || 52;
  const canPrev = raceLoaded && currentLap > 1;
  const canNext = raceLoaded && currentLap < lastDataLap;
  const canPlayLap =
    raceLoaded && currentLap > 0 && currentLapDuration >= 25 && !isLoading;

  const lapDurFloor = Math.floor(currentLapDuration || 0);
  const atLapEnd = lapDurFloor > 0 && lapElapsedSeconds >= lapDurFloor;

  const chartsBlock = (
    <div className="flex flex-col gap-4" style={{ minHeight: 0 }}>
      <DashCard title="LAP TIMES">
        <LapTimeChart />
      </DashCard>
      <DashCard title="TYRE DEG">
        <TyreDegradationCard />
      </DashCard>
      <DashCard title="STRATEGY TIMELINE">
        <StrategyTimeline
          totalLaps={timelineTotal}
          currentLap={currentLap || 0}
          stints={stints}
        />
        <TyreLegend />
      </DashCard>
    </div>
  );

  const dashH = `calc(100vh - ${HEADER_HEIGHT_PX}px + ${TEAM_RADIO_EXTEND_BELOW_VH_PX}px)`;

  return (
    <div
      className="min-w-0 flex-shrink-0"
      style={{
        height: dashH,
        maxHeight: dashH,
        overflow: "hidden",
        borderTop: "1px solid var(--dash-border)",
        background: "var(--dash-bg)",
        boxSizing: "border-box",
      }}
    >
      <div
        className="box-border h-full min-h-0 p-4"
        style={{ height: "100%", minHeight: 0 }}
      >
        <div
          style={{
            display: "grid",
            height: "100%",
            minHeight: 0,
            gridTemplateColumns: "25% 40% 35%",
            gridTemplateRows: "minmax(0, 1fr) minmax(0, 1.15fr)",
            gap: 0,
            border: "1px solid var(--dash-border)",
            borderRadius: RADIO_CARD_RADIUS,
            overflow: "hidden",
            background: "var(--dash-surface)",
            boxSizing: "border-box",
          }}
        >
          {/* Col 1 row 1: race + lap controls */}
          <div
            style={{
              gridColumn: 1,
              gridRow: 1,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: 16,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <RaceSelectionCard />
            <PreRaceModal
              isOpen={preRaceOpen}
              onClose={() => setPreRaceOpen(false)}
              recommended={
                ppoOutput
                  ? {
                      compounds: ["SOFT", "MEDIUM", "HARD"],
                      stintLengths: [18, 22, 12],
                      expectedPosition: 3,
                      rationale: "Two-stop, undercut window.",
                    }
                  : PLACEHOLDER_STRATEGY
              }
              alternative1={
                ppoOutput
                  ? {
                      compounds: ["MEDIUM", "HARD"],
                      stintLengths: [28, 24],
                      expectedPosition: 4,
                      rationale: "One-stop.",
                    }
                  : PLACEHOLDER_STRATEGY
              }
              alternative2={
                ppoOutput
                  ? {
                      compounds: ["SOFT", "HARD"],
                      stintLengths: [22, 30],
                      expectedPosition: 5,
                      rationale: "Alternative two-stop.",
                    }
                  : PLACEHOLDER_STRATEGY
              }
              openingMessage=""
            />
            <div
              className="rounded overflow-hidden"
              style={{
                background: "var(--dash-surface)",
                border: "1px solid var(--dash-border)",
                borderRadius: RADIO_CARD_RADIUS,
                padding: "20px 24px",
              }}
            >
              <div style={CARD_HEADER_STYLE}>LAP CONTROLS</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => void prevLap()}
                  disabled={!canPrev || isLoading}
                  style={{
                    ...CTRL_BTN,
                    width: "auto",
                    flex: 1,
                    opacity: canPrev && !isLoading ? 1 : 0.45,
                    cursor:
                      canPrev && !isLoading ? "pointer" : "not-allowed",
                  }}
                >
                  ◀ PREV
                </button>
                <button
                  type="button"
                  onClick={() => void nextLap()}
                  disabled={!canNext || isLoading}
                  style={{
                    ...CTRL_BTN,
                    width: "auto",
                    flex: 1,
                    opacity: canNext && !isLoading ? 1 : 0.45,
                    cursor:
                      canNext && !isLoading ? "pointer" : "not-allowed",
                  }}
                >
                  NEXT ▶
                </button>
              </div>
              <div
                style={{
                  marginTop: 14,
                  fontFamily: "var(--font-display)",
                  fontSize: 12,
                  color: "var(--dash-text-primary)",
                  letterSpacing: "0.1em",
                  textAlign: "center",
                  opacity: raceLoaded ? 1 : 0.5,
                }}
              >
                LAP {raceLoaded ? currentLap : "—"} /{" "}
                {raceLoaded ? replayTotal : "—"}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color: "var(--sky-blue)",
                  textAlign: "center",
                  opacity: raceLoaded ? 1 : 0.5,
                }}
              >
                {formatClock(raceLoaded ? lapElapsedSeconds : 0)} /{" "}
                {formatClock(raceLoaded ? currentLapDuration || 0 : 0)}
              </div>
              <button
                type="button"
                onClick={toggleAutoPlay}
                disabled={!canPlayLap}
                style={{
                  ...CTRL_BTN,
                  marginTop: 14,
                  opacity: canPlayLap ? 1 : 0.4,
                }}
              >
                {isPlaying
                  ? "⏸ PAUSE"
                  : atLapEnd
                    ? "▶ REPLAY LAP"
                    : "▶ PLAY LAP"}
              </button>
              <select
                value={playbackSpeed}
                onChange={(e) =>
                  setPlaybackSpeed(Number(e.target.value) as 1 | 2 | 5)
                }
                style={{ ...CTRL_SELECT, marginTop: 10 }}
                title="Simulated seconds per real second"
                disabled={!raceLoaded}
              >
                <option value={1}>1× lap speed</option>
                <option value={2}>2× lap speed</option>
                <option value={5}>5× lap speed</option>
              </select>
              {isLoading && (
                <span
                  style={{
                    display: "block",
                    marginTop: 10,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--dash-text-muted)",
                    textAlign: "center",
                  }}
                >
                  SYNC…
                </span>
              )}
            </div>
          </div>

          {/* Col 2 row 1: circuit map */}
          <div
            style={{
              gridColumn: 2,
              gridRow: 1,
              borderLeft: "1px solid var(--dash-border)",
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              justifyContent: "center",
              padding: 16,
              minHeight: 0,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "100%",
                minWidth: 0,
                minHeight: 0,
                flex: "1 1 auto",
                maxHeight: "100%",
                aspectRatio: "1 / 1",
                maxWidth: "100%",
                margin: "0 auto",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <TrackMap compactSquare />
            </div>
          </div>

          {/* Col 3: team radio — full grid height, internal scroll */}
          <aside
            data-testid="radio-column"
            style={{
              gridColumn: 3,
              gridRow: "1 / -1",
              borderLeft: "1px solid var(--dash-border)",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              minWidth: 0,
              height: "100%",
              overflow: "hidden",
              padding: 16,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                flex: "1 1 0%",
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <EngineerPanel />
            </div>
          </aside>

          {/* Row 2: charts under left + center */}
          <div
            style={{
              gridColumn: "1 / 3",
              gridRow: 2,
              borderTop: "1px solid var(--dash-border)",
              padding: 16,
              overflowY: "auto",
              minHeight: 0,
              background: "var(--dash-surface)",
            }}
          >
            {chartsBlock}
          </div>
        </div>
      </div>
    </div>
  );
}
