"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCross } from "@/components/primitives/icons";
import { PROJECT_TEMPLATES } from "@/lib/instructions";
import { SkillPicker, useSkillCatalogue } from "./SkillPicker";

/* A project is a long-lived thread, not a session — name it once and come
 * back to it for weeks. cwd is optional metadata we keep on our side;
 * api_server.py's session response has no cwd field to mirror it into. */

export function NewProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
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
  // Mounting the form only while open is what resets it — clearing the
  // fields from an effect would be a cascading render.
  return <NewProjectForm onClose={onClose} onCreated={onCreated} />;
}

function NewProjectForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [templateId, setTemplateId] = useState("blank");
  const [instructions, setInstructions] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const catalogue = useSkillCatalogue();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // iOS won't focus without a frame of delay after the mount
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          cwd: cwd.trim() || undefined,
          instructions: instructions.trim() || null,
          skills,
          emoji: PROJECT_TEMPLATES.find((t) => t.id === templateId)?.emoji,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${res.status}`);
      }
      const { project } = (await res.json()) as { project: { id: string } };
      onCreated?.();
      onClose();
      router.push(`/p/${project.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setBusy(false);
    }
  }

  return (
    // Bottom sheet on a phone, centred card on a desktop.
    <div
      className="px-safe fixed inset-0 z-60 flex items-end justify-center py-3 sm:items-center"
      style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-label="New project"
        onSubmit={create}
        className="relative w-full max-w-sm overflow-hidden rounded-card bg-surface shadow-overlay"
        style={{
          animation: "pop-in var(--duration-fast) var(--ease-out-strong) both",
          marginBottom: "max(0px, calc(env(safe-area-inset-bottom) - 4px))",
        }}
      >
        {/* The form outgrew a phone viewport once skills were added — scroll the
            body and keep the footer actions pinned. */}
        <div className="primitive-card-pad scroll-area max-h-[70dvh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <span className="text-ui font-medium text-ink">New project</span>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="primitive-icon-button shrink-0 text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
            >
              <IconCross size={14} />
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Project name"
              aria-label="Project name"
              className="h-9 w-full rounded-control border border-line bg-field px-2.5 text-input
                text-ink outline-none transition-colors duration-150 placeholder:text-ink-3
                focus:border-line-strong sm:text-ui"
            />
            <input
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              placeholder="Working directory (optional)"
              aria-label="Working directory"
              className="h-9 w-full rounded-control border border-line bg-field px-2.5 font-mono
                text-input text-ink outline-none transition-colors duration-150
                placeholder:text-ink-3 focus:border-line-strong sm:text-label"
            />

            <div className="flex flex-wrap gap-1.5 pt-0.5" role="group" aria-label="Template">
              {PROJECT_TEMPLATES.map((t) => {
                const active = t.id === templateId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setTemplateId(t.id);
                      // Only overwrite prose the user hasn't touched.
                      const untouched = PROJECT_TEMPLATES.some(
                        (o) => o.instructions === instructions,
                      );
                      if (untouched || !instructions.trim()) {
                        setInstructions(t.instructions);
                      }
                      if (!name.trim() && t.id !== "blank") setName(t.label);
                    }}
                    className="h-7 rounded-chip border px-2 text-label transition-colors duration-100"
                    style={{
                      borderColor: active ? "var(--ink)" : "var(--line)",
                      background: active ? "var(--ink)" : "transparent",
                      color: active ? "var(--surface)" : "var(--ink-2)",
                    }}
                  >
                    {t.emoji} {t.label}
                  </button>
                );
              })}
            </div>

            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={4}
              placeholder="Standing instructions — sent with every message in this project"
              aria-label="Project instructions"
              className="w-full resize-y rounded-control border border-line bg-field px-2.5 py-2
                text-input leading-relaxed text-ink outline-none transition-colors duration-150
                placeholder:text-ink-3 focus:border-line-strong sm:text-label"
            />
            <p className="text-meta leading-snug text-ink-3">
              Re-sent on every turn, so it survives context compaction instead of
              scrolling away like a pinned message. Editable later.
            </p>

            <div className="pt-0.5">
              <span className="text-label font-medium text-ink">Linked skills</span>
              <SkillPicker value={skills} onChange={setSkills} catalogue={catalogue} />
            </div>
          </div>

          {error && (
            <p className="mt-2 text-label text-red" style={{ animation: "fade-in 150ms ease-out both" }}>
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
            type="submit"
            disabled={!name.trim() || busy}
            className="h-8 rounded-control px-3 text-label font-medium
              transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.98]"
            style={{
              background: name.trim() && !busy ? "var(--ink)" : "var(--line-strong)",
              color: name.trim() && !busy ? "var(--surface)" : "var(--ink-2)",
            }}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
