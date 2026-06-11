import type { StintSegment } from "@/components/strategy/StrategyTimeline";
import type { LapData } from "@/types";

/** Groups consecutive laps on the same compound into stint segments. */
export function buildStints(laps: LapData[]): StintSegment[] {
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
