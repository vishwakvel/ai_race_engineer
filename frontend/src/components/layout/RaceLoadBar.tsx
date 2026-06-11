import { useRaceLoader } from "@/hooks/useRaceLoader";
import { Button } from "@/components/ui/Button";

const selectStyle: React.CSSProperties = {
  background: "var(--dash-elevated)",
  border: "1px solid var(--dash-border)",
  color: "var(--dash-text-primary)",
  fontFamily: "var(--font-display)",
  fontSize: "11px",
  textTransform: "uppercase",
  padding: "4px 10px",
  borderRadius: "2px",
  height: 26,
};

/**
 * Inline season / race / load controls for the timing strip.
 */
export function RaceLoadBar() {
  const {
    years,
    roundsForYear,
    selectedYear,
    setSelectedYear,
    selectedRound,
    setSelectedRound,
    loading,
    loadRace,
    racesLoading,
    racesFailed,
    refetchRaces,
  } = useRaceLoader();

  return (
    <div
      className="flex items-center gap-2 pr-4 mr-4 border-r border-dash-border shrink-0 w-[min(100%,28rem)] lg:w-[min(100%,32rem)]"
      aria-label="Load race session"
    >
      <label className="sr-only" htmlFor="bar-season-select">
        Season
      </label>
      <select
        id="bar-season-select"
        value={years.length ? selectedYear : ""}
        onChange={(e) => {
          setSelectedYear(Number(e.target.value));
          setSelectedRound(null);
        }}
        disabled={!years.length || racesLoading}
        style={{
          ...selectStyle,
          width: 72,
          flexShrink: 0,
          opacity: years.length ? 1 : 0.5,
        }}
        title="Season"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="bar-race-select">
        Race
      </label>
      <select
        id="bar-race-select"
        value={selectedRound ?? ""}
        onChange={(e) =>
          setSelectedRound(e.target.value ? Number(e.target.value) : null)
        }
        disabled={!years.length || racesLoading}
        style={{ ...selectStyle, flex: "1 1 0", minWidth: 0, width: "100%" }}
        title="Race"
      >
        <option value="">SELECT RACE</option>
        {roundsForYear.map((r) => (
          <option key={r.round} value={r.round}>
            {r.circuit}
          </option>
        ))}
      </select>

      <Button
        variant="primary"
        className="!text-[11px] !tracking-[0.08em] !px-3.5 !py-0 h-[26px] shrink-0 !bg-ferrari-red !text-white !border-ferrari-red enabled:hover:!bg-ferrari-red enabled:hover:!text-white"
        onClick={() => void loadRace()}
        disabled={selectedRound == null || loading || !years.length}
      >
        {loading ? "…" : "LOAD RACE"}
      </Button>

      {racesFailed && (
        <button
          type="button"
          onClick={() => void refetchRaces()}
          className="font-display text-[10px] uppercase tracking-wider text-status-warn bg-transparent border-none cursor-pointer p-0 shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  );
}
