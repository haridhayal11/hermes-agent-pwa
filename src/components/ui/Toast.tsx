"use client";

import { IconCross } from "@/components/primitives/icons";

/* Hand-rolled rather than shadcn's Sonner wrapper: the token layer here is
 * beautifului.dev's, and shadcn init would lay its own --background/--foreground
 * set over the top. One toast at a time is all this app needs. */

export function Toast({
  message,
  tone = "neutral",
  action,
  onDismiss,
}: {
  message: string;
  tone?: "neutral" | "error";
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      className="pointer-events-auto flex items-center gap-2 rounded-card bg-surface px-2.5 py-2 shadow-overlay"
      style={{ animation: "toast-in var(--duration-fast) var(--ease-out-strong) both" }}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${tone === "error" ? "bg-red" : "bg-ink-3"}`}
      />
      <span className="min-w-0 flex-1 truncate text-label text-ink">{message}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-chip px-1.5 py-0.5 text-label font-medium text-accent-ink
            transition-colors duration-100 hover:bg-hover"
        >
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="flex size-5 shrink-0 items-center justify-center rounded-full text-ink-3
            transition-colors duration-100 hover:bg-hover hover:text-ink"
        >
          <IconCross size={11} />
        </button>
      )}
    </div>
  );
}
