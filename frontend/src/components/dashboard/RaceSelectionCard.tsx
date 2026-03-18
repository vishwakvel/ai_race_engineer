import { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import type { RaceListItem } from "@/types";
import { useRaceStore } from "@/store/raceStore";

const selectStyle: React.CSSProperties = {
  background: "var(--dash-elevated)",
  border: "1px solid var(--dash-border)",
  color: "var(--dash-text-primary)",
  fontFamily: "var(--font-display)",
  fontSize: "13px",
  textTransform: "uppercase",
  padding: "8px 12px",
  borderRadius: "2px",
  minWidth: 100,
};

export function RaceSelectionCard() {
  const [races, setRaces] = useState<RaceListItem[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const setSelectedRace = useRaceStore((s) => s.setSelectedRace);
  const setAllLaps = useRaceStore((s) => s.setAllLaps);
  const setRaceLoaded = useRaceStore((s) => s.setRaceLoaded);
  const setTotalLaps = useRaceStore((s) => s.setTotalLaps);
  const resetRace = useRaceStore((s) => s.resetRace);
  const bumpRaceLoadSeq = useRaceStore((s) => s.bumpRaceLoadSeq);

  useEffect(() => {
    apiClient
      .getRaces()
      .then((list) => {
        setRaces(list);
        if (list.length > 0) {
          const ys = [...new Set(list.map((r) => r.year))].sort((a, b) => b - a);
          const y = ys.includes(2024) ? 2024 : ys[0];
          setSelectedYear(y);
          setSelectedRound(null);
        }
      })
      .catch(console.error);
  }, []);

  const years = [...new Set(races.map((r) => r.year))].sort((a, b) => b - a);
  const roundsForYear = races
    .filter((r) => r.year === selectedYear)
    .sort((a, b) => a.round - b.round);

  return (
    <div
      className="rounded overflow-hidden"
      style={{
        background: "var(--dash-surface)",
        border: "1px solid var(--dash-border)",
        borderRadius: 4,
        padding: "20px 24px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: "0.2em",
          color: "var(--dash-text-secondary)",
          textTransform: "uppercase",
          borderBottom: "1px solid var(--dash-border)",
          paddingBottom: 12,
          marginBottom: 16,
        }}
      >
        SELECT RACE
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <label
            className="uppercase text-[10px] tracking-wider"
            style={{ color: "var(--dash-text-muted)", fontFamily: "var(--font-display)" }}
          >
            Season
          </label>
          <select
            value={years.length ? selectedYear : ""}
            onChange={(e) => {
              setSelectedYear(Number(e.target.value));
              setSelectedRound(null);
            }}
            disabled={!years.length}
            style={{ ...selectStyle, minWidth: 0, width: "100%", opacity: years.length ? 1 : 0.5 }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <label
            className="uppercase text-[10px] tracking-wider"
            style={{ color: "var(--dash-text-muted)", fontFamily: "var(--font-display)" }}
          >
            Race
          </label>
          <select
            value={selectedRound ?? ""}
            onChange={(e) =>
              setSelectedRound(e.target.value ? Number(e.target.value) : null)
            }
            style={{ ...selectStyle, minWidth: 0, width: "100%" }}
          >
            <option value="">SELECT RACE</option>
            {roundsForYear.map((r) => (
              <option key={r.round} value={r.round}>
                {r.circuit}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex items-end">
          <button
            type="button"
            onClick={async () => {
              if (selectedRound == null) return;
              setLoading(true);
              resetRace();
              try {
                const laps = await apiClient.getRaceLaps(selectedYear, selectedRound);
                const match = races.find(
                  (r) => r.year === selectedYear && r.round === selectedRound
                );
                setSelectedRace({
                  year: selectedYear,
                  round: selectedRound,
                  circuit: match?.circuit_id ?? "bahrain",
                });
                setAllLaps(laps);
                setTotalLaps(
                  match?.total_laps ??
                    (laps.length > 0 ? laps[laps.length - 1]!.lapNumber : laps.length)
                );
                setRaceLoaded(true);
                bumpRaceLoadSeq();
              } catch (e) {
                console.error("Failed to load race:", e);
              } finally {
                setLoading(false);
              }
            }}
            disabled={selectedRound == null || loading || !years.length}
            className="transition-colors duration-150"
            style={{
              background: "transparent",
              border: "1px solid var(--ferrari-red)",
              color: "var(--ferrari-red)",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "13px",
              textTransform: "uppercase",
              padding: "10px 18px",
              borderRadius: "2px",
              width: "100%",
              cursor:
                selectedRound != null && !loading && years.length ? "pointer" : "not-allowed",
              opacity: selectedRound != null && years.length ? 1 : 0.5,
              letterSpacing: "0.08em",
            }}
            onMouseEnter={(e) => {
              if (selectedRound == null || loading) return;
              e.currentTarget.style.background = "var(--ferrari-red)";
              e.currentTarget.style.color = "white";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--ferrari-red)";
            }}
          >
            {loading ? "LOADING..." : "LOAD RACE"}
          </button>
        </div>
      </div>
      {races.length === 0 && (
        <p
          className="mt-3 text-xs uppercase tracking-wide"
          style={{ color: "var(--dash-text-muted)", fontFamily: "var(--font-display)" }}
        >
          No races from API. Start backend and run clean_data, or check VITE_API_BASE_URL.
        </p>
      )}
    </div>
  );
}
