"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SkillPicker, useSkillCatalogue } from "@/components/nav/SkillPicker";
import type { Job } from "@/hooks/useJobs";
import type { Project } from "@/lib/chat-types";

/* Create or edit one Hermes cron job.
 *
 * The schedule field is free text passed straight through. Hermes' own
 * `parse_schedule` is the authority — the same grammar the CLI and Telegram
 * use — and duplicating it here would only give the phone a second, subtly
 * different opinion about what "every 30m" means.
 *
 * A job reports to exactly one place. Mechanically it could do both — this
 * app reads the output file Hermes writes regardless of `deliver` — and it did at
 * first, which meant one fire arriving as a Telegram message and a push
 * notification seconds apart, and a per-job switch to mute one of them. One
 * picker and no switch is the better trade: the redundancy was never worth
 * the control it needed.
 */

const SCHEDULE_HINT =
  "Hermes' own grammar: “every 30m”, “0 9 * * *”, “2026-02-03T14:00”, or a bare “2h” to run once. Cron expressions need croniter installed on the gateway.";

const FIELD =
  "h-9 w-full rounded-control border border-line bg-field px-2.5 text-input text-ink outline-none transition-colors duration-150 placeholder:text-ink-3 focus:border-line-strong sm:text-label";

export function JobSheet({
  job,
  projects,
  open,
  onClose,
  onSaved,
}: {
  /** absent for a new job */
  job?: Job;
  projects: Project[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label={job ? "Edit job" : "New job"}>
      {/* remounted per open, so an abandoned edit never reappears half-typed */}
      {open && (
        <JobForm
          job={job}
          projects={projects}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Sheet>
  );
}

function JobForm({
  job,
  projects,
  onClose,
  onSaved,
}: {
  job?: Job;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(job?.name ?? "");
  const [schedule, setSchedule] = useState(job?.schedule_display ?? "");
  const [prompt, setPrompt] = useState(job?.prompt ?? "");
  const [skills, setSkills] = useState<string[]>(job?.skills ?? []);
  const [repeat, setRepeat] = useState(
    job?.repeat?.times != null ? String(job.repeat.times) : "",
  );
  /* One control, two shapes. `destination` is a project id, or "hermes" when
   * the gateway posts it, and `deliver` is only meaningful in the second. */
  const [destination, setDestination] = useState(
    job?.binding?.project_id ?? (job && job.deliver !== "local" ? "hermes" : ""),
  );
  const [deliver, setDeliver] = useState(
    job && job.deliver !== "local" ? job.deliver : "",
  );
  const catalogue = useSkillCatalogue();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(path: string, init: RequestInit): Promise<Job | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, init);
      const body = (await res.json().catch(() => ({}))) as {
        job?: Job;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || `${res.status}`);
      return body.job ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !name.trim() || !schedule.trim()) return;

    const toProject = destination !== "" && destination !== "hermes";
    const binding = toProject ? { project_id: destination } : null;
    const payload = {
      name: name.trim(),
      schedule: schedule.trim(),
      prompt,
      // The route forces "local" whenever a project is bound; sending it here
      // too just keeps the request honest about what was asked for.
      deliver: toProject ? "local" : destination === "hermes" ? deliver.trim() : "local",
      skills,
      // Only on create: blank means forever, which is what omitting it means
      // to Hermes. The edit path never sends it — see the Runs block below.
      repeat: !job && repeat.trim() ? Number(repeat.trim()) : undefined,
      binding,
    };

    const result = job
      ? await call(`/api/jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await call("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    if (!result) return;
    onSaved();
    onClose();
  }

  async function act(action: "run" | "pause" | "resume") {
    if (!job) return;
    const result = await call(`/api/jobs/${job.id}/${action}`, { method: "POST" });
    if (!result) return;
    onSaved();
    setNote(
      action === "run"
        ? "Queued — it fires on the scheduler's next tick."
        : action === "pause"
          ? "Paused."
          : "Resumed.",
    );
  }

  async function remove() {
    if (!job || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${res.status}`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setBusy(false);
    }
  }

  const paused = job ? job.enabled === false : false;

  return (
    <form onSubmit={save} className="flex flex-col gap-3 p-4">
      <div>
        <label htmlFor="job-name" className="text-label font-medium text-ink">
          Name
        </label>
        <input
          id="job-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Daily calorie summary"
          className={`mt-2 ${FIELD}`}
        />
      </div>

      <div>
        <label htmlFor="job-schedule" className="text-label font-medium text-ink">
          Schedule
        </label>
        <p className="mt-0.5 text-meta leading-snug text-ink-3">{SCHEDULE_HINT}</p>
        <input
          id="job-schedule"
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
          placeholder="0 9 * * *"
          className={`mt-2 font-mono ${FIELD}`}
        />
        {job?.next_run_at && (
          <p className="mt-1 font-mono text-meta text-ink-3">
            Next: {new Date(job.next_run_at).toLocaleString()}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="job-prompt" className="text-label font-medium text-ink">
          Prompt
        </label>
        <p className="mt-0.5 text-meta leading-snug text-ink-3">
          What the agent is asked, every time it fires. It runs unattended, so
          say what to produce rather than asking it to check in.
        </p>
        <textarea
          id="job-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={6}
          placeholder="Summarise today's food log and compare it against the daily targets."
          className="mt-2 w-full resize-y rounded-control border border-line bg-field px-2.5 py-2
            text-input leading-relaxed text-ink outline-none transition-colors duration-150
            placeholder:text-ink-3 focus:border-line-strong sm:text-label"
        />
      </div>

      <div>
        <span className="text-label font-medium text-ink">Skills</span>
        <SkillPicker value={skills} onChange={setSkills} catalogue={catalogue} />
      </div>

      <div>
        <label htmlFor="job-destination" className="text-label font-medium text-ink">
          Report to
        </label>
        <p className="mt-0.5 text-meta leading-snug text-ink-3">
          One place. A job bound to a project here appears in that thread and
          notifies this device; one delivered by Hermes goes wherever the
          gateway sends it and this app stays out of the way.
        </p>
        <select
          id="job-destination"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          className={`mt-2 ${FIELD}`}
        >
          <option value="">Nowhere — just keep the output on disk</option>
          <optgroup label="Projects">
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.emoji ? `${project.emoji} ` : ""}
                {project.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Hermes gateway">
            <option value="hermes">A gateway platform…</option>
          </optgroup>
        </select>
      </div>

      {destination === "hermes" && (
        <div>
          <label htmlFor="job-deliver" className="text-label font-medium text-ink">
            Gateway target
          </label>
          <p className="mt-0.5 text-meta leading-snug text-ink-3">
            A platform like <code>telegram</code>, or one chat in particular:{" "}
            <code>telegram:-100123:17</code>.
          </p>
          <input
            id="job-deliver"
            value={deliver}
            onChange={(event) => setDeliver(event.target.value)}
            placeholder="telegram"
            className={`mt-2 font-mono ${FIELD}`}
          />
        </div>
      )}

      {/* Create-only. Hermes' PATCH would take the number and overwrite the
        * {times, completed} record with it, which breaks the scheduler's own
        * reads — so an existing job shows its limit and can't change it here. */}
      {job ? (
        <div>
          <span className="text-label font-medium text-ink">Runs</span>
          <p className="mt-0.5 text-meta leading-snug text-ink-3">
            Fired {job.repeat?.completed ?? 0} time
            {(job.repeat?.completed ?? 0) === 1 ? "" : "s"}
            {job.repeat?.times != null
              ? ` of ${job.repeat.times}. The limit is set when the job is made and can only be changed from the CLI.`
              : ", with no limit."}
          </p>
        </div>
      ) : (
        <div>
          <label htmlFor="job-repeat" className="text-label font-medium text-ink">
            Run at most
          </label>
          <p className="mt-0.5 text-meta leading-snug text-ink-3">
            Fixed when the job is created — leave it blank unless you mean it.
          </p>
          <input
            id="job-repeat"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="Leave blank to run forever"
            className={`mt-2 ${FIELD}`}
          />
        </div>
      )}

      {note && <p className="text-label text-ink-2">{note}</p>}
      {error && (
        <p className="text-label text-red" style={{ animation: "fade-in 150ms ease-out both" }}>
          {error}
        </p>
      )}

      {job && (
        <div className="flex flex-col items-start gap-1 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => void act("run")}
            disabled={busy}
            className="h-8 rounded-control px-2.5 text-label font-medium text-ink-2
              transition-colors duration-100 enabled:hover:bg-hover enabled:hover:text-ink
              disabled:opacity-50"
          >
            Run now
          </button>
          <button
            type="button"
            onClick={() => void act(paused ? "resume" : "pause")}
            disabled={busy}
            className="h-8 rounded-control px-2.5 text-label font-medium text-ink-2
              transition-colors duration-100 enabled:hover:bg-hover enabled:hover:text-ink
              disabled:opacity-50"
          >
            {paused ? "Resume" : "Pause"}
          </button>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-8 rounded-control px-2.5 text-label font-medium text-red
                transition-colors duration-100 hover:bg-hover"
            >
              Delete job
            </button>
          ) : (
            <div
              className="w-full"
              style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
            >
              <p className="text-label font-medium text-ink">Delete “{job.name}”?</p>
              <p className="mt-1 text-meta leading-snug text-ink-2">
                Hermes also deletes its own record of every run. What it already
                delivered into a project here stays in that thread.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="h-8 rounded-control px-2.5 text-label font-medium text-ink-2
                    transition-colors duration-100 hover:bg-hover hover:text-ink"
                >
                  Keep
                </button>
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={busy}
                  className="h-8 rounded-control px-3 text-label font-medium text-white
                    transition-[background-color,transform] duration-200 enabled:active:scale-[0.98]"
                  style={{ background: "var(--red, #dc2626)" }}
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
          disabled={busy || !name.trim() || !schedule.trim()}
          className="h-8 rounded-control px-3 text-label font-medium
            transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.98]"
          style={{
            background: busy || !name.trim() || !schedule.trim() ? "var(--line-strong)" : "var(--ink)",
            color: busy || !name.trim() || !schedule.trim() ? "var(--ink-2)" : "var(--surface)",
          }}
        >
          {busy ? "Saving…" : job ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}
