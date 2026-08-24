"use client";

/* A one-line horizontal meter. Two callers with the same geometry: a
 * recommendation's confidence and a subagent fan-out's task progress.
 *
 * The colour ramp is only meaningful for confidence — progress passes
 * `tone="neutral"` and stays on --accent, because "1 of 4 done" is not a
 * worse outcome than "4 of 4". */

export function Meter({
  value,
  label,
  caption,
  tone = "ramp",
}: {
  /** 0..1; clamped, so an agent writing 1.5 or -0.2 can't overflow the track */
  value: number;
  label?: string;
  caption?: string;
  tone?: "ramp" | "neutral";
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const colour =
    tone === "neutral"
      ? "var(--accent)"
      : pct >= 75
        ? "var(--green)"
        : pct >= 40
          ? "var(--orange)"
          : "var(--red)";

  return (
    <div className="flex flex-col gap-1">
      {(label || caption) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && <span className="text-meta text-ink-3">{label}</span>}
          {caption && (
            <span className="text-meta tabular-nums text-ink-2">{caption}</span>
          )}
        </div>
      )}
      <div
        className="h-1 w-full overflow-hidden rounded-chip bg-line"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "progress"}
      >
        <div
          className="h-full rounded-chip transition-[width] duration-300"
          style={{
            width: `${pct}%`,
            background: colour,
            transitionTimingFunction: "var(--ease-out-strong)",
          }}
        />
      </div>
    </div>
  );
}
