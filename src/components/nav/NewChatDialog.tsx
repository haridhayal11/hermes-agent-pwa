"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/* Starting a fresh thread is the pencil's job, and it is the one action in the
 * app that throws away continuity — the project keeps everything about itself
 * and points at a brand-new Hermes session. So it confirms.
 *
 * Same call as ProjectSettings' "Start a fresh thread"; that one stays, since
 * it costs nothing and is where you already are when you're editing a project.
 */

export function NewChatDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Mounted only while open, so the error and busy state reset with it.
  return <NewChatConfirm projectId={projectId} onClose={onClose} />;
}

function NewChatConfirm({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reset`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // 409 while a run is active — the route refuses rather than orphan it.
        throw new Error(body.error || `${res.status}`);
      }
      onClose();
      // ChatThread is keyed on session_id, so the refresh remounts the thread.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start a new chat");
      setBusy(false);
    }
  }

  return (
    <div
      className="px-safe h-app fixed inset-x-0 top-0 z-60 flex items-end justify-center py-3 sm:items-center"
      style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New chat"
        className="relative w-full max-w-sm overflow-hidden rounded-card bg-surface shadow-overlay"
        style={{
          animation: "pop-in var(--duration-fast) var(--ease-out-strong) both",
          marginBottom: "max(0px, calc(env(safe-area-inset-bottom) - 4px))",
        }}
      >
        <div className="primitive-card-pad">
          <span className="text-ui font-medium text-ink">Start a new chat?</span>
          <p className="mt-1.5 text-meta leading-snug text-ink-2">
            The project keeps its name, instructions and skills, and points at a
            new Hermes conversation. The old transcript stays reachable from the
            CLI. Not possible while a run is active.
          </p>
          {error && (
            <p
              className="mt-2 text-label text-red"
              style={{ animation: "fade-in 150ms ease-out both" }}
            >
              {error}
            </p>
          )}
        </div>

        <div className="primitive-card-footer flex items-center justify-end gap-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-control px-2.5 text-label font-medium text-ink-2
              transition-colors duration-100 hover:bg-hover hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="h-8 rounded-control px-3 text-label font-medium
              transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.98]"
            style={{
              background: busy ? "var(--line-strong)" : "var(--ink)",
              color: busy ? "var(--ink-2)" : "var(--surface)",
            }}
          >
            {busy ? "Starting…" : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
}
