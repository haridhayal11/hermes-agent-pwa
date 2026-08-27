"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/Sheet";
import type { Project } from "@/lib/chat-types";
import { parseSkills } from "@/lib/instructions";
import { SkillPicker, useSkillCatalogue } from "./SkillPicker";
import { useStatus } from "@/hooks/useStatus";

/* A project's standing instructions live here rather than in a pinned message.
 * They're passed to Hermes as `instructions` on every run, so editing them
 * changes how the very next turn is framed — including turns hundreds of
 * messages deep, after compaction has discarded the early transcript.
 *
 * The gear that used to open this directly is now a menu (HeaderMenu) — this
 * is "Edit project", one entry among several, and the app-wide settings that
 * were awkwardly stapled to the foot of this form live at /settings. */

export function ProjectSettingsSheet({
  project,
  open,
  onClose,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Edit project">
      {/* remounted per open, so an abandoned edit never reappears half-typed */}
      {open && <ProjectSettingsForm project={project} onClose={onClose} />}
    </Sheet>
  );
}

function ProjectSettingsForm({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [emoji, setEmoji] = useState(project.emoji ?? "");
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [cwd, setCwd] = useState(project.cwd ?? "");
  const [pinned, setPinned] = useState(project.pinned === 1);
  const [skills, setSkills] = useState<string[]>(() => parseSkills(project.skills));
  const catalogue = useSkillCatalogue();
  const { features } = useStatus();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dropSession, setDropSession] = useState(false);
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);



  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${project.id}`)
      .then((r) => r.json())
      .then((body: { messageCount?: number | null }) => {
        if (!cancelled) setMessageCount(body.messageCount ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  /** Archive, not delete: keeps every row and the Hermes transcript, and just
   *  drops the project out of the rail. Reversible from /settings. */
  async function archive() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`${res.status}`);
      onClose();
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive");
      setBusy(false);
    }
  }

  /** Adds a new root session while preserving the current one in the tree. */
  async function reset() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New chat" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // 409 while a run is active — the route refuses rather than orphan it
        throw new Error(body.error || `${res.status}`);
      }
      const body = (await res.json()) as { session: { id: string } };
      onClose();
      router.push(`/p/${project.id}/s/${body.session.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start a new thread");
      setBusy(false);
    }
  }

  /** Branch the project's currently selected session below the same project. */
  async function branch() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/fork`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${res.status}`);
      }
      const body = (await res.json()) as { session: { id: string } };
      onClose();
      router.push(`/p/${project.id}/s/${body.session.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to branch");
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const qs = `purge=1${dropSession ? "&session=1" : ""}`;
      const res = await fetch(`/api/projects/${project.id}?${qs}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${res.status}`);
      }
      onClose();
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || project.name,
          emoji: emoji.trim() || null,
          instructions: instructions.trim() || null,
          cwd: cwd.trim() || null,
          pinned,
          skills,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${res.status}`);
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 p-4">
      <div className="flex items-end gap-2">
        <div className="shrink-0">
          <label htmlFor="project-emoji" className="text-label font-medium text-ink">
            Icon
          </label>
          {/* One grapheme, not a picker. iOS gives every text field an emoji
              keyboard already, so a 900-glyph grid would be a worse version of
              a control the OS ships. */}
          <input
            id="project-emoji"
            value={emoji}
            onChange={(event) =>
              setEmoji([...event.target.value.trim()].slice(0, 2).join(""))
            }
            placeholder="💬"
            aria-label="Project emoji"
            className="mt-2 h-9 w-12 rounded-control border border-line bg-field text-center
              text-input text-ink outline-none transition-colors duration-150
              placeholder:text-ink-3 focus:border-line-strong"
          />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="project-name" className="text-label font-medium text-ink">
            Name
          </label>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={project.name}
            className="mt-2 h-9 w-full rounded-control border border-line bg-field px-2.5
              text-input text-ink outline-none transition-colors duration-150
              placeholder:text-ink-3 focus:border-line-strong sm:text-label"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="project-instructions"
          className="text-label font-medium text-ink"
        >
          Standing instructions
        </label>
        <p className="mt-0.5 text-meta leading-snug text-ink-3">
          Sent with every message in this project. Unlike a pinned message it is
          never lost to context compaction.
        </p>
        <textarea
          id="project-instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={8}
          placeholder="e.g. Use the fitness journal as the authoritative source for meals, weight and training."
          className="mt-2 w-full resize-y rounded-control border border-line bg-field px-2.5 py-2
            text-input leading-relaxed text-ink outline-none transition-colors duration-150
            placeholder:text-ink-3 focus:border-line-strong sm:text-label"
        />
      </div>

      <div>
        <span className="text-label font-medium text-ink">Linked skills</span>
        <SkillPicker value={skills} onChange={setSkills} catalogue={catalogue} />
      </div>

      <div>
        <label htmlFor="project-cwd" className="text-label font-medium text-ink">
          Working directory
        </label>
        <p className="mt-0.5 text-meta leading-snug text-ink-3">
          Stated to the agent as text — the API has no per-request working directory,
          so tools need absolute paths.
        </p>
        <input
          id="project-cwd"
          value={cwd}
          onChange={(event) => setCwd(event.target.value)}
          placeholder="/srv/code/example"
          className="mt-2 h-9 w-full rounded-control border border-line bg-field px-2.5 font-mono
            text-input text-ink outline-none transition-colors duration-150
            placeholder:text-ink-3 focus:border-line-strong sm:text-label"
        />
      </div>

      <label className="flex items-center gap-2 text-label text-ink">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(event) => setPinned(event.target.checked)}
          className="size-4 accent-[var(--ink)]"
        />
        Pin to the front of the project rail
      </label>

      {error && (
        <p className="text-label text-red" style={{ animation: "fade-in 150ms ease-out both" }}>
          {error}
        </p>
      )}

      {/* Thread lifecycle — reversible things first, then the one that isn't. */}
      <div className="flex flex-col items-start gap-1 border-t border-line pt-3">
        {/* Hidden on a Hermes without POST /api/sessions/{id}/fork, which would
          * only 404. */}
        {features.session_fork && (
          <button
            type="button"
            onClick={branch}
            disabled={busy}
            className="h-8 rounded-control px-2.5 text-label font-medium text-ink-2
              transition-colors duration-100 enabled:hover:bg-hover enabled:hover:text-ink
              disabled:opacity-50"
          >
            Branch this session
          </button>
        )}
        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="h-8 rounded-control px-2.5 text-label font-medium text-ink-2
              transition-colors duration-100 hover:bg-hover hover:text-ink"
          >
            Start a fresh thread
          </button>
        ) : (
          <div
            className="w-full"
            style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
          >
            <p className="text-label font-medium text-ink">Start a fresh thread?</p>
            <p className="mt-1 text-meta leading-snug text-ink-2">
              The project keeps its name, instructions and skills. The current
              conversation stays in the sidebar and the new chat opens beside it.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="h-8 rounded-control px-2.5 text-label font-medium text-ink-2
                  transition-colors duration-100 hover:bg-hover hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="h-8 rounded-control border border-line-strong px-3 text-label
                  font-medium text-ink transition-[background-color,transform] duration-200
                  enabled:hover:bg-hover enabled:active:scale-[0.98]"
              >
                {busy ? "Starting…" : "Start fresh"}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={archive}
          disabled={busy}
          className="h-8 rounded-control px-2.5 text-label font-medium text-ink-2
            transition-colors duration-100 hover:bg-hover hover:text-ink"
        >
          Archive project
        </button>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="h-8 rounded-control px-2.5 text-label font-medium text-red
              transition-colors duration-100 hover:bg-hover"
          >
            Delete project
          </button>
        ) : (
          <div
            className="w-full"
            style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
          >
            <p className="text-label font-medium text-ink">
              Delete “{project.name}”?
            </p>
            <label className="mt-2 flex items-start gap-2 text-meta leading-snug text-ink-2">
              <input
                type="checkbox"
                checked={dropSession}
                onChange={(event) => setDropSession(event.target.checked)}
                className="mt-0.5 size-3.5 accent-[var(--ink)]"
              />
              <span>
                Also delete the Hermes conversation
                {messageCount != null && messageCount > 0
                  ? ` (${messageCount} message${messageCount === 1 ? "" : "s"})`
                  : ""}
                . Leave unchecked to keep the transcript reachable from the CLI
                and other Hermes clients.
              </span>
            </label>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  setDropSession(false);
                }}
                className="h-8 rounded-control px-2.5 text-label font-medium text-ink-2
                  transition-colors duration-100 hover:bg-hover hover:text-ink"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="h-8 rounded-control px-3 text-label font-medium text-white
                  transition-[background-color,transform] duration-200 enabled:active:scale-[0.98]"
                style={{ background: "var(--red, #dc2626)" }}
              >
                {busy ? "Deleting…" : dropSession ? "Delete both" : "Delete project"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-control px-2.5 text-label font-medium text-ink-2
            transition-colors duration-100 hover:bg-hover hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="h-8 rounded-control px-3 text-label font-medium
            transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.98]"
          style={{
            background: busy ? "var(--line-strong)" : "var(--ink)",
            color: busy ? "var(--ink-2)" : "var(--surface)",
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
