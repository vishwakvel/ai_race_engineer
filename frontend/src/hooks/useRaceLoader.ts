import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { racesQuery, raceLapsQuery } from "@/api/queries";
import { queryClient } from "@/api/queryClient";
import { useRaceStore } from "@/store/raceStore";

export function useRaceLoader() {
  const navigate = useNavigate();
  const [selectedYear, setSelectedYear] = useState(2024);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const raceLoaded = useRaceStore((s) => s.raceLoaded);
  const selectedRace = useRaceStore((s) => s.selectedRace);
  const setSelectedRace = useRaceStore((s) => s.setSelectedRace);
  const setAllLaps = useRaceStore((s) => s.setAllLaps);
  const setRaceLoaded = useRaceStore((s) => s.setRaceLoaded);
  const setTotalLaps = useRaceStore((s) => s.setTotalLaps);
  const resetRace = useRaceStore((s) => s.resetRace);
  const bumpRaceLoadSeq = useRaceStore((s) => s.bumpRaceLoadSeq);
  const setStatusError = useRaceStore((s) => s.setStatusError);

  const {
    data: races = [],
    isPending: racesLoading,
    isError: racesFailed,
    refetch: refetchRaces,
  } = useQuery(racesQuery);

  useEffect(() => {
    if (races.length === 0) return;
    const ys = [...new Set(races.map((r) => r.year))].sort((a, b) => b - a);
    const y = ys.includes(2024) ? 2024 : ys[0]!;
    setSelectedYear((prev) => (races.some((r) => r.year === prev) ? prev : y));
  }, [races]);

  useEffect(() => {
    if (raceLoaded && selectedRace) {
      setSelectedYear(selectedRace.year);
      setSelectedRound(selectedRace.round);
    }
  }, [raceLoaded, selectedRace]);

  const years = [...new Set(races.map((r) => r.year))].sort((a, b) => b - a);
  const roundsForYear = races
    .filter((r) => r.year === selectedYear)
    .sort((a, b) => a.round - b.round);

  const loadRace = useCallback(async () => {
    if (selectedRound == null) return;
    setLoading(true);
    setStatusError(null);
    resetRace();
    try {
      const laps = await queryClient.fetchQuery(
        raceLapsQuery(selectedYear, selectedRound)
      );
      if (laps.length === 0) {
        setStatusError(`NO LAP DATA FOR ${selectedYear} ROUND ${selectedRound}`);
        return;
      }
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
      navigate(`/race/${selectedYear}/${selectedRound}`, { replace: true });
    } catch (e) {
      console.error("Failed to load race:", e);
      setStatusError("RACE LOAD FAILED — CHECK BACKEND CONNECTION AND RETRY");
    } finally {
      setLoading(false);
    }
  }, [
    selectedRound,
    selectedYear,
    races,
    resetRace,
    setStatusError,
    setSelectedRace,
    setAllLaps,
    setTotalLaps,
    setRaceLoaded,
    bumpRaceLoadSeq,
    navigate,
  ]);

  return {
    races,
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
  };
}
