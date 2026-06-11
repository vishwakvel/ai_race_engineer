import { useRaceStore } from "@/store/raceStore";

/**
 * Slim broadcast-style status strip for connection/data failures.
 * Renders nothing while everything is healthy.
 */
export function StatusBanner() {
  const statusError = useRaceStore((s) => s.statusError);
  const setStatusError = useRaceStore((s) => s.setStatusError);

  if (!statusError) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 px-6 py-2 border-b"
      style={{
        background: "rgba(232, 0, 45, 0.08)",
        borderColor: "var(--ferrari-red)",
      }}
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-dash-text-primary">
        <span className="text-ferrari-red font-semibold">⚠ TELEMETRY</span>
        {"  "}
        {statusError}
      </span>
      <button
        type="button"
        onClick={() => setStatusError(null)}
        className="font-display text-[10px] uppercase tracking-[0.15em] text-dash-text-secondary hover:text-dash-text-primary bg-transparent border-none cursor-pointer"
      >
        Dismiss
      </button>
    </div>
  );
}
