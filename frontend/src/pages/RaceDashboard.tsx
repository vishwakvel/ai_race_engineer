import { LapTimeChart } from "@/components/telemetry/LapTimeChart";
import { TyreDegradationCard } from "@/components/telemetry/TyreDegradationCard";
import { PositionTracker } from "@/components/telemetry/PositionTracker";
import { StrategyTimeline } from "@/components/strategy/StrategyTimeline";
import { PitWindowCard } from "@/components/strategy/PitWindowCard";
import { PositionDistribution } from "@/components/strategy/PositionDistribution";
import { SafetyCarGauge } from "@/components/safety/SafetyCarGauge";
import { TyreLegend } from "@/components/common/TyreLegend";
import { TrackMap } from "@/components/track/TrackMap";
import { EngineerPanel } from "@/components/engineer/EngineerPanel";
import { PreRaceModal } from "@/components/engineer/PreRaceModal";
import { useQuery } from "@tanstack/react-query";
import { useRaceStore } from "@/store/raceStore";
import { useRaceReplay } from "@/hooks/useRaceReplay";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { buildStints } from "@/utils/stints";
import { preraceStrategyQuery } from "@/api/queries";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";

const CTRL_SELECT: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--dash-border)",
  color: "var(--dash-text-primary)",
  fontFamily: "var(--font-display)",
  fontSize: 11,
  textTransform: "uppercase",
  borderRadius: 2,
  padding: "10px 12px",
  letterSpacing: "0.06em",
  cursor: "pointer",
  appearance: "auto",
  width: "100%",
};

const PLACEHOLDER_STRATEGY = {
  compounds: ["—"] as string[],
  stintLengths: [0] as number[],
  expectedPosition: 0,
  rationale: "Load a race for strategy options.",
};

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
  const lapElapsedSeconds = useRaceStore((s) => s.lapElapsedSeconds);
  const selectedRace = useRaceStore((s) => s.selectedRace);
  const plannedStrategy = useRaceStore((s) => s.plannedStrategy);

  const { data: prerace, isFetching: preraceLoading } = useQuery({
    ...preraceStrategyQuery(
      selectedRace?.circuit ?? "",
      selectedRace?.year ?? 2024,
      totalLapsStore || 50
    ),
    enabled: raceLoaded && !!selectedRace && preRaceOpen,
  });

  const replay = useRaceReplay();
  const {
    totalLaps: replayTotal,
    lastDataLap,
    isLoading,
    playbackSpeed,
    currentLapDuration,
    nextLap,
    prevLap,
    toggleRaceMode,
    raceMode,
    setPlaybackSpeed,
  } = replay;

  const stints =
    raceLoaded && allLaps.length > 0 ? buildStints(allLaps) : [];
  const timelineTotal =
    totalLapsStore > 0 ? totalLapsStore : replayTotal || 52;
  const canPrev = raceLoaded && currentLap > 1;
  const canNext = raceLoaded && currentLap < lastDataLap;

  useKeyboardShortcuts(
    {
      onPrevLap: () => {
        if (canPrev && !isLoading) void prevLap();
      },
      onNextLap: () => {
        if (canNext && !isLoading) void nextLap();
      },
      onToggleRaceMode: () => {
        if (raceLoaded) toggleRaceMode();
      },
      onSpeed1: () => raceLoaded && setPlaybackSpeed(1),
      onSpeed2: () => raceLoaded && setPlaybackSpeed(2),
      onSpeed5: () => raceLoaded && setPlaybackSpeed(5),
      onPreRaceBrief: () => setPreRaceOpen(true),
    },
    raceLoaded
  );

  const chartsBlock = (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Panel title="PIT WALL CALL" density="compact">
          <PitWindowCard />
          <div className="mt-3 pt-2.5 border-t border-dash-border">
            <PositionTracker />
          </div>
        </Panel>
        <Panel title="SC PROBABILITY" density="compact">
          <SafetyCarGauge />
        </Panel>
        <Panel title="FINISH FORECAST" density="compact">
          <PositionDistribution />
        </Panel>
      </div>
      <Panel title="LAP TIMES">
        <LapTimeChart />
      </Panel>
      <Panel title="TYRE DEG">
        <TyreDegradationCard />
      </Panel>
    </div>
  );

  return (
    <div
      className="min-w-0 border-t border-dash-border bg-dash-bg box-border lg:h-[calc(100vh-40px)] lg:max-h-[calc(100vh-40px)] lg:overflow-hidden"
    >
      <div className="box-border h-full min-h-0 p-3">
        <div
          className="grid h-full min-h-0 grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_3fr_minmax(288px,33%)] lg:grid-rows-[minmax(0,432px)_minmax(0,1fr)] rounded border border-dash-border bg-dash-surface box-border"
        >
          {/* Lap controls */}
          <div
            className="flex flex-col gap-2.5 p-2.5 min-h-0 h-full lg:col-start-1 lg:row-start-1"
          >
            <PreRaceModal
              isOpen={preRaceOpen}
              onClose={() => setPreRaceOpen(false)}
              recommended={prerace?.recommended ?? PLACEHOLDER_STRATEGY}
              alternative1={prerace?.alternative1 ?? PLACEHOLDER_STRATEGY}
              alternative2={prerace?.alternative2 ?? PLACEHOLDER_STRATEGY}
              openingMessage={prerace?.openingMessage ?? ""}
              isLoading={preraceLoading}
            />
            <Panel title="LAP CONTROLS" className="shrink-0">
              <div className="flex gap-2.5">
                <Button
                  className="flex-1"
                  onClick={() => void prevLap()}
                  disabled={!canPrev || isLoading}
                >
                  ◀ PREV
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => void nextLap()}
                  disabled={!canNext || isLoading}
                >
                  NEXT ▶
                </Button>
              </div>
              <div
                className="mt-2.5 font-display text-[11px] tracking-[0.1em] text-center text-dash-text-primary"
                style={{ opacity: raceLoaded ? 1 : 0.5 }}
              >
                LAP {raceLoaded ? currentLap : "—"} /{" "}
                {raceLoaded ? replayTotal : "—"}
              </div>
              <div
                className="mt-1 font-mono text-[12px] text-center text-sky-blue"
                style={{ opacity: raceLoaded ? 1 : 0.5 }}
              >
                {formatClock(raceLoaded ? lapElapsedSeconds : 0)} /{" "}
                {formatClock(raceLoaded ? currentLapDuration || 0 : 0)}
              </div>
              <Button
                variant="primary"
                className={clsx(
                  "mt-3.5 w-full",
                  raceMode && "!bg-ferrari-red !text-white"
                )}
                onClick={toggleRaceMode}
                disabled={!raceLoaded}
                title="Continuous race playback (Space or R)"
              >
                {raceMode ? "⏹ STOP RACE MODE" : "▶ RACE MODE"}
              </Button>
              <select
                value={playbackSpeed}
                onChange={(e) =>
                  setPlaybackSpeed(Number(e.target.value) as 1 | 2 | 5)
                }
                style={{ ...CTRL_SELECT, marginTop: 8 }}
                title="Simulated seconds per real second"
                disabled={!raceLoaded}
                aria-label="Lap playback speed"
              >
                <option value={1}>1× lap speed</option>
                <option value={2}>2× lap speed</option>
                <option value={5}>5× lap speed</option>
              </select>
              {isLoading && (
                <span className="block mt-2.5 font-mono text-[10px] text-center text-dash-text-muted">
                  SYNC…
                </span>
              )}
            </Panel>
            <Panel
              title="STRATEGY"
              density="compact"
              className="flex-1 min-h-0 pb-1"
              action={
                plannedStrategy ? (
                  <span className="font-mono text-[9px] tracking-[0.06em] text-status-gain">
                    P{plannedStrategy.expectedPosition}
                  </span>
                ) : undefined
              }
            >
              <StrategyTimeline
                compact
                totalLaps={timelineTotal}
                currentLap={currentLap || 0}
                stints={stints}
              />
              <TyreLegend compact />
            </Panel>
          </div>

          {/* Circuit map — 60% of left block, fills cell (no letterbox gutter) */}
          <div
            className="flex h-full w-full min-w-0 min-h-0 p-1 border-t border-dash-border md:border-t-0 md:border-l lg:col-start-2 lg:row-start-1"
          >
            <TrackMap compactSquare />
          </div>

          {/* Team radio — full grid height on desktop, bounded block below md */}
          <aside
            data-testid="radio-column"
            className="flex flex-col min-h-0 min-w-0 overflow-hidden p-4 box-border border-t border-dash-border h-[480px] md:col-span-2 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:border-t-0 lg:border-l lg:h-full"
          >
            <div className="flex flex-col min-h-0 overflow-hidden" style={{ flex: "1 1 0%" }}>
              <EngineerPanel />
            </div>
          </aside>

          {/* Telemetry — all panels in one scroll region */}
          <div
            className="min-h-0 overflow-y-auto border-t border-dash-border p-3 bg-dash-surface md:col-span-2 lg:col-start-1 lg:col-span-2 lg:row-start-2"
          >
            {chartsBlock}
          </div>
        </div>
      </div>
    </div>
  );
}
