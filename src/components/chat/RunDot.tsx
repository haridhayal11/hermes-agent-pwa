"use client";

import { useRunStatus } from "./RunStatusContext";
import type { ActivityState } from "@/lib/activity";

/* The at-a-glance signal that a run is live, once the thread has scrolled past
 * its own status line. Idle draws nothing: a grey dot that is always there is
 * a dot nobody looks at. Orange is the one hue it borrows, and only because
 * the run is blocked on the reader. */

export type DotState = ActivityState | "stopping";

const LABELS: Record<DotState, string> = {
  approval: "Waiting for approval",
  question: "Waiting on your answer",
  running: "Running",
  stopping: "Stopping",
  unseen: "New reply",
  failed: "Run failed",
};

/* Hue is a signal (DESIGN.md): orange when the run needs you — a pulse for
 * an approval holding a live run, steady for a question it ended on — red
 * when it failed. A live run is a neutral pulse, and a reply nobody has opened is the
 * same hue-free accent dot as an unread report. */
const COLOURS: Record<DotState, string> = {
  approval: "var(--orange)",
  question: "var(--orange)",
  running: "var(--ink-2)",
  stopping: "var(--ink-2)",
  unseen: "var(--accent)",
  failed: "var(--red)",
};

export function StatusDot({
  state,
  className = "",
}: {
  state: DotState;
  className?: string;
}) {
  const live = state === "approval" || state === "running" || state === "stopping";
  return (
    <span
      role="status"
      aria-label={LABELS[state]}
      title={LABELS[state]}
      className={`size-2 shrink-0 rounded-full ${className}`}
      style={{
        background: COLOURS[state],
        animation: live ? "pulse-dot 1.4s var(--ease-smooth-out) infinite" : undefined,
      }}
    />
  );
}

export function RunDot({ className = "" }: { className?: string }) {
  const { phase } = useRunStatus();
  if (phase === "idle") return null;
  return (
    <StatusDot
      className={className}
      state={
        phase === "waiting_for_approval"
          ? "approval"
          : phase === "stopping"
            ? "stopping"
            : "running"
      }
    />
  );
}
