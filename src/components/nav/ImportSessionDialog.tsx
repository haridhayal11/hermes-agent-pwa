"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/components/chat/MessageActions";
import { IconCross } from "@/components/primitives/icons";
import { buttonClass, FIELD_CLASS, HELP_CLASS, ICON_BUTTON } from "@/components/ui/SettingsControls";
import { relativeTime } from "@/lib/relative-time";

/* Bring a conversation started somewhere else — the CLI, Telegram — into
 * this project, so the phone can carry it on. It is the same Hermes session,
 * not a copy, which is why it then belongs to this project alone and why
 * removing it here never deletes it from Hermes. */

interface Importable {
  id: string;
  title: string | null;
  source: string | null;
  preview: string | null;
  messageCount: number | null;
  lastActive: number | null;
}

export function ImportSessionDialog({
  projectId,
  open,
  query,
  resume,
  onClose,
}: {
  projectId: string;
  open: boolean;
  /** prefills the filter */
  query?: string;
  /** bring in a lone exact title match without asking — `/resume <name>` */
  resume?: boolean;
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
  // Mounted only while open, so the list is read fresh every time.
  return <ImportPicker projectId={projectId} query={query} resume={resume} onClose={onClose} />;
}

function titleOf(session: Importable) {
  return session.title || session.preview || "Untitled chat";
}

function ImportPicker({
  projectId,
  query = "",
  resume = false,
  onClose,
}: {
  projectId: string;
  query?: string;
  resume?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [filter, setFilter] = useState(query);
  const [sessions, setSessions] = useState<Importable[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resumed = useRef(false);

  const bringIn = useCallback(
    async (session: Importable) => {
      setBusyId(session.id);
      setError(null);
      try {
        const response = await fetch(`/api/projects/${projectId}/sessions/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          session?: { id: string };
          error?: string;
        };
        if (!response.ok || !body.session) throw new Error(body.error || `${response.status}`);
        onClose();
        router.push(`/p/${projectId}/s/${body.session.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't bring that chat in");
        setBusyId(null);
      }
    },
    [projectId, onClose, router],
  );

  /** One page of Hermes' sessions; state is applied by the caller. */
  const fetchPage = useCallback(
    async (offset: number): Promise<{ sessions: Importable[]; nextOffset: number | null }> => {
      const response = await fetch(
        `/api/projects/${projectId}/importable-sessions?offset=${offset}`,
      );
      const body = (await response.json().catch(() => ({}))) as {
        sessions?: Importable[];
        nextOffset?: number | null;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || `${response.status}`);
      return { sessions: body.sessions ?? [], nextOffset: body.nextOffset ?? null };
    },
    [projectId],
  );

  const fail = (err: unknown) => {
    setError(err instanceof Error ? err.message : "Couldn't list Hermes' sessions");
    setSessions((current) => current ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    fetchPage(0)
      .then((page) => {
        if (cancelled) return;
        setSessions(page.sessions);
        setNextOffset(page.nextOffset);
        if (!resume || resumed.current || !query.trim()) return;
        resumed.current = true;
        const wanted = query.trim().toLowerCase();
        const matches = page.sessions.filter(
          (session) => session.title?.trim().toLowerCase() === wanted,
        );
        if (matches.length === 1) void bringIn(matches[0]);
      })
      .catch((err) => {
        if (!cancelled) fail(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, resume, query, bringIn]);

  const loadMore = (offset: number) => {
    setLoading(true);
    fetchPage(offset)
      .then((page) => {
        setSessions((current) => [...(current ?? []), ...page.sessions]);
        setNextOffset(page.nextOffset);
      })
      .catch(fail)
      .finally(() => setLoading(false));
  };

  const needle = filter.trim().toLowerCase();
  const shown = (sessions ?? []).filter(
    (session) =>
      !needle ||
      titleOf(session).toLowerCase().includes(needle) ||
      (session.source ?? "").toLowerCase().includes(needle),
  );

  return (
    <div
      className="px-safe h-app fixed inset-x-0 top-0 z-60 flex items-end justify-center py-3 sm:items-center"
      style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-scrim"
        style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bring in a chat"
        className="relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[20px] bg-surface shadow-overlay"
        style={{
          animation: "pop-in var(--duration-fast) var(--ease-out-strong) both",
          marginBottom: "max(0px, calc(var(--safe-bottom) - 4px))",
        }}
      >
        <div className="flex items-start justify-between gap-2 px-5 pt-5">
          <div>
            <span className="text-title font-semibold text-ink">Bring in a chat</span>
            <p className={`mt-1 ${HELP_CLASS}`}>
              Conversations started in the CLI, Telegram or anywhere else. Turns
              made elsewhere after this show up here on reload, and this
              project&rsquo;s instructions apply to new turns.
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className={`${ICON_BUTTON} -mt-1 -mr-2`}>
            <IconCross size={16} />
          </button>
        </div>

        <div className="px-5 pt-3 pb-2">
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by title or source"
            aria-label="Filter sessions"
            className={FIELD_CLASS}
          />
        </div>

        <ul className="scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
          {shown.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => void bringIn(session)}
                disabled={busyId !== null}
                className="flex min-h-12 w-full flex-col gap-0.5 rounded-control px-2 py-2 text-left
                  transition-colors duration-150 enabled:hover:bg-hover disabled:opacity-60"
              >
                <span className="flex w-full min-w-0 items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-ui text-ink">{titleOf(session)}</span>
                  {busyId === session.id && <span className="shrink-0 text-meta text-ink-3">Bringing in…</span>}
                </span>
                <span className="truncate text-meta text-ink-3 tabular-nums">
                  {[
                    session.source,
                    session.messageCount != null
                      ? `${session.messageCount} ${session.messageCount === 1 ? "message" : "messages"}`
                      : null,
                    hydrated && session.lastActive ? relativeTime(session.lastActive) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
          {sessions && shown.length === 0 && !loading && (
            <li className="px-2 py-3 text-label text-ink-3">
              {needle ? "Nothing matches." : "Every Hermes session is already a chat here."}
            </li>
          )}
          {loading && <li className="px-2 py-3 text-label text-ink-3">Loading…</li>}
        </ul>

        {(error || nextOffset !== null) && (
          <div className="flex items-center justify-between gap-3 px-5 pt-1 pb-5">
            {error ? (
              <p className="text-label text-red" style={{ animation: "fade-in 150ms ease-out both" }}>
                {error}
              </p>
            ) : (
              <span />
            )}
            {nextOffset !== null && (
              <button
                type="button"
                onClick={() => loadMore(nextOffset)}
                disabled={loading}
                className={buttonClass("secondary", "sm")}
              >
                More
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
