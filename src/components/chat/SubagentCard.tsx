"use client";

import type { SubagentRun } from "@/lib/chat-types";
import { Meter } from "@/components/ui/Meter";
import { IconAgent } from "@/components/primitives/icons";

/* delegate_task children, from the subagent.start / subagent.complete events
 * on /v1/runs. Hermes deliberately withholds the child's own tool calls and
 * thinking from this stream ("high-volume UI noise") and forwards only the
 * lifecycle boundaries — but those boundaries carry the accounting: duration,
 * tokens, cost, files touched. That is the useful part on a phone anyway.
 *
 * Every field past the id is optional because Hermes only forwards the keys
 * it actually has, and a `complete` can arrive with no matching `start` when
 * a reconnect ate the gap. */

function metrics(run: SubagentRun): string[] {
  const out: string[] = [];
  if (run.durationSeconds != null) {
    out.push(
      run.durationSeconds >= 60
        ? `${Math.round(run.durationSeconds / 60)}m`
        : `${run.durationSeconds.toFixed(1)}s`,
    );
  }
  const tokens = (run.inputTokens ?? 0) + (run.outputTokens ?? 0);
  if (tokens > 0) {
    out.push(tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k tok` : `${tokens} tok`);
  }
  if (run.costUsd != null && run.costUsd > 0) {
    // Sub-cent runs are the common case; two decimals would read as "$0.00".
    out.push(run.costUsd < 0.01 ? `$${run.costUsd.toFixed(4)}` : `$${run.costUsd.toFixed(2)}`);
  }
  const files = (run.filesRead ?? 0) + (run.filesWritten ?? 0);
  if (files > 0) out.push(`${files} file${files === 1 ? "" : "s"}`);
  return out;
}

function StatusDot({ status }: { status: SubagentRun["status"] }) {
  if (status === "running") {
    return (
      <span
        className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
        style={{ animation: "spin 700ms linear infinite" }}
      />
    );
  }
  return (
    <span
      className={`size-2 shrink-0 rounded-full ${status === "failed" ? "bg-red" : "bg-green"}`}
    />
  );
}

function SubagentRow({ run }: { run: SubagentRun }) {
  const strip = metrics(run);
  const hasProgress =
    run.taskCount != null && run.taskCount > 1 && run.taskIndex != null;

  return (
    <div
      className="rounded-card bg-surface px-2.5 py-2 shadow-hairline"
      style={{ animation: "fade-up var(--duration-medium) var(--ease-out-strong) both" }}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center text-ink-3">
          <IconAgent size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-label text-ink">
          {run.goal || "Subagent"}
        </span>
        {run.model && (
          <span className="shrink-0 rounded-chip bg-field px-1.5 font-mono text-meta text-ink-3">
            {run.model}
          </span>
        )}
        <StatusDot status={run.status} />
      </div>

      {hasProgress && (
        <div className="mt-1.5">
          <Meter
            tone="neutral"
            value={(run.taskIndex as number) / (run.taskCount as number)}
            caption={`${run.taskIndex} / ${run.taskCount}`}
          />
        </div>
      )}

      {run.summary && run.status !== "running" && (
        <p className="mt-1.5 border-l border-line pl-2.5 font-mono text-meta leading-[1.6] whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">
          {run.summary}
        </p>
      )}

      {strip.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-meta tabular-nums text-ink-3">
          {strip.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SubagentCards({ subagents }: { subagents: SubagentRun[] }) {
  if (subagents.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {subagents.map((run) => (
        <SubagentRow key={run.id} run={run} />
      ))}
    </div>
  );
}
