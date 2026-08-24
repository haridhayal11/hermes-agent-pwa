"use client";

import { useEffect, useState } from "react";
import { usePreferences } from "@/components/PreferencesContext";

/* ─────────────────────────────────────────────────────────
 * RUN STATUS — beautifului.dev's LoadingState, de-demoed.
 * The pixel grid and shimmer label are lifted verbatim; the
 * elapsed timer now counts from the run's real start time
 * instead of from mount, so it survives a remount mid-run.
 * ───────────────────────────────────────────────────────── */

const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

function LoaderGrid() {
  return (
    <span aria-hidden className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]">
      {chevron.map((delay, index) => (
        <span
          key={index}
          className="size-[4px] rounded-[1px] bg-ink"
          style={{ opacity: 0.15, animation: `pixel-on 650ms ease-in-out ${delay}ms infinite` }}
        />
      ))}
    </span>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

export function RunStatusLine({
  label,
  startedAt,
}: {
  label: string;
  startedAt: number | null;
}) {
  const { prefs } = usePreferences();
  const [now, setNow] = useState(() => Date.now());
  const showElapsed = prefs.showRunDuration && startedAt != null;

  useEffect(() => {
    // No readout, no 10Hz interval — this is the only always-on timer in the
    // app while a run is in flight.
    if (!showElapsed) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [showElapsed]);

  return (
    <div role="status" className="flex w-fit items-center gap-2.5">
      <LoaderGrid />
      <span
        className="bg-clip-text text-ui font-medium text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
          backgroundSize: "200% 100%",
          animation: "shimmer-text 1.4s linear infinite",
        }}
      >
        {label}
      </span>
      {showElapsed && (
        <span className="font-mono text-label text-ink-3 tabular-nums">
          {formatElapsed(now - startedAt)}
        </span>
      )}
    </div>
  );
}
