import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useRaceStore } from "@/store/raceStore";
import { racesQuery } from "@/api/queries";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";

/** Canonical deep-link path for a loaded race session. */
export function raceSessionPath(year: number, round: number, lap?: number): string {
  const lapQ = lap != null && lap > 0 ? `?lap=${lap}` : "";
  return `/race/${year}/${round}${lapQ}`;
}

/**
 * Keeps the URL in sync with the loaded session:
 * `/race/:year/:round?lap=N` — deep-linkable, refresh-safe.
 */
export function useRaceUrlSync() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const bootstrapped = useRef(false);

  const raceLoaded = useRaceStore((s) => s.raceLoaded);
  const currentLap = useRaceStore((s) => s.currentLap);
  const selectedRace = useRaceStore((s) => s.selectedRace);
  const setSelectedRace = useRaceStore((s) => s.setSelectedRace);
  const setAllLaps = useRaceStore((s) => s.setAllLaps);
  const setTotalLaps = useRaceStore((s) => s.setTotalLaps);
  const setRaceLoaded = useRaceStore((s) => s.setRaceLoaded);
  const bumpRaceLoadSeq = useRaceStore((s) => s.bumpRaceLoadSeq);
  const resetRace = useRaceStore((s) => s.resetRace);
  const setCurrentLap = useRaceStore((s) => s.setCurrentLap);

  const { data: races = [] } = useQuery(racesQuery);

  // Deep-link bootstrap: load race from URL once on mount.
  useEffect(() => {
    if (bootstrapped.current || !params.year || !params.round || !races.length) {
      return;
    }
    bootstrapped.current = true;

    const year = Number(params.year);
    const round = Number(params.round);
    if (!Number.isFinite(year) || !Number.isFinite(round)) return;

    const match = races.find((r) => r.year === year && r.round === round);
    if (!match) return;

    void (async () => {
      resetRace();
      try {
        const laps = await apiClient.getRaceLaps(year, round);
        setSelectedRace({
          year,
          round,
          circuit: match.circuit_id ?? match.circuit,
        });
        setAllLaps(laps);
        setTotalLaps(match.total_laps ?? laps[laps.length - 1]?.lapNumber ?? laps.length);
        setRaceLoaded(true);
        bumpRaceLoadSeq();

        const lapParam = Number(searchParams.get("lap"));
        if (Number.isFinite(lapParam) && lapParam > 0) {
          setCurrentLap(lapParam);
        }

        document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" });
      } catch {
        /* StatusBanner surfaces load errors via React Query elsewhere */
      }
    })();
  }, [
    params.year,
    params.round,
    races,
    searchParams,
    resetRace,
    setSelectedRace,
    setAllLaps,
    setTotalLaps,
    setRaceLoaded,
    bumpRaceLoadSeq,
    setCurrentLap,
  ]);

  // Push URL when session or lap changes (after a race is loaded).
  useEffect(() => {
    if (!raceLoaded || !selectedRace) return;
    const target = raceSessionPath(selectedRace.year, selectedRace.round, currentLap);
    if (window.location.pathname + window.location.search !== target) {
      navigate(target, { replace: true });
    }
  }, [raceLoaded, selectedRace, currentLap, navigate]);
}
