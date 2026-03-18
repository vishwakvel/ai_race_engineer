import { useRaceStore } from "@/store/raceStore";

function compoundFromAction(action: string): string {
  if (action.includes("SOFT")) return "SOFT";
  if (action.includes("MEDIUM")) return "MEDIUM";
  if (action.includes("HARD")) return "HARD";
  return "—";
}

export function PitWindowCard() {
  const ppoOutput = useRaceStore((s) => s.ppoOutput);
  const action = ppoOutput?.recommendedAction ?? ppoOutput?.action ?? "STAY_OUT";
  const pitWindow = ppoOutput?.pitWindow;
  const open =
    pitWindow != null &&
    pitWindow.length >= 2 &&
    pitWindow[0]! <= pitWindow[1]!;
  const boxNow = open && pitWindow![0] === pitWindow![1];
  const isPit =
    typeof action === "string" && action !== "STAY_OUT" && action.startsWith("PIT");

  if (boxNow || (isPit && open && pitWindow![0] === pitWindow![1])) {
    return (
      <div
        className="rounded p-4"
        style={{
          borderLeft: "4px solid var(--ferrari-red)",
          background: "var(--ferrari-red-glow)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 900,
            fontSize: 32,
            color: "var(--ferrari-red)",
            textTransform: "uppercase",
          }}
        >
          BOX THIS LAP
        </div>
        <div
          className="mt-2"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            color: "var(--dash-text-primary)",
          }}
        >
          COMPOUND: {compoundFromAction(action)}
        </div>
      </div>
    );
  }

  if (open) {
    return (
      <div
        className="rounded p-4 relative overflow-hidden"
        style={{
          borderLeft: "4px solid var(--status-gain)",
          animation: "sc-pulse 2s ease-in-out infinite",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 28,
            color: "var(--status-gain)",
            textTransform: "uppercase",
          }}
        >
          PIT WINDOW OPEN
        </div>
        <div
          className="mt-2 font-mono text-sm"
          style={{ color: "var(--status-gain)", fontFamily: "var(--font-mono)", fontSize: 14 }}
        >
          LAPS {pitWindow![0]} – {pitWindow![1]}
        </div>
        {isPit && (
          <div
            className="mt-1"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--dash-text-primary)",
            }}
          >
            PPO: {action}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 28,
          color: "var(--dash-text-secondary)",
          textTransform: "uppercase",
        }}
      >
        {isPit ? action.replace(/_/g, " ") : "STAY OUT"}
      </div>
      <div
        className="mt-1"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--dash-text-muted)",
        }}
      >
        {open
          ? `Window: L${pitWindow![0]}–${pitWindow![1]}`
          : "Window opens: LAP —"}
      </div>
    </div>
  );
}
