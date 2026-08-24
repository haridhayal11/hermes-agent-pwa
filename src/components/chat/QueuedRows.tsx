"use client";

/* TaskRows' row shape — numbered ring, label, status pill — reused for the
 * queue. Queueing is a real feature here, not a workaround: /v1/runs/{id}/steer
 * does not exist in Hermes v0.17.0, so a message sent mid-run waits and the
 * run manager starts it when the current run goes terminal. */

function Ring({ index }: { index: number }) {
  const size = 22;
  const stroke = 2;
  const r = (size - stroke) / 2;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      </svg>
      <span className="relative text-micro font-semibold text-ink-3 tabular-nums">
        {index}
      </span>
    </span>
  );
}

export function QueuedRows({ queued }: { queued: string[] }) {
  if (queued.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {queued.map((text, i) => (
        <div
          key={`${i}-${text.slice(0, 24)}`}
          className="flex items-center gap-2.5 rounded-card bg-surface px-2.5 py-2 shadow-hairline"
          style={{
            animation: `fade-up var(--duration-slow) var(--ease-out-strong) ${i * 80}ms both`,
          }}
        >
          <Ring index={i + 1} />
          <span className="min-w-0 flex-1 truncate text-ui text-ink-2">{text}</span>
          <span className="shrink-0 rounded-full bg-inset px-2 py-0.5 text-meta font-medium text-ink-3">
            Queued
          </span>
        </div>
      ))}
    </div>
  );
}
