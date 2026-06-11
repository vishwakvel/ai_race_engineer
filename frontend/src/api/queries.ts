import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "./client";

/** Race index — static per session. */
export const racesQuery = queryOptions({
  queryKey: ["races"],
  queryFn: () => apiClient.getRaces(),
  staleTime: Infinity,
  retry: 2,
});

/** Track map geometry — static per circuit; fetched once and cached forever. */
export function trackMapQuery(circuitId: string) {
  return queryOptions({
    queryKey: ["trackMap", circuitId.toLowerCase().replace(/-/g, "_")],
    queryFn: () => apiClient.getTrackMap(circuitId),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });
}

/** Pre-race strategy brief — computed once per loaded race. */
export function preraceStrategyQuery(
  circuit: string,
  year: number,
  totalLaps: number
) {
  return queryOptions({
    queryKey: ["preraceStrategy", circuit, year, totalLaps],
    queryFn: () =>
      apiClient.getPreraceStrategy({ circuit, year, total_laps: totalLaps }),
    staleTime: Infinity,
    retry: 1,
  });
}

/** Full lap telemetry for one race — immutable historical data. */
export function raceLapsQuery(year: number, round: number) {
  return queryOptions({
    queryKey: ["raceLaps", year, round],
    queryFn: () => apiClient.getRaceLaps(year, round),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });
}
