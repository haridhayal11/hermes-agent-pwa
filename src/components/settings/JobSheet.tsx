"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SkillPicker, useSkillCatalogue } from "@/components/nav/SkillPicker";
import {
  FIELD_CLASS,
  HELP_CLASS,
  LABEL_CLASS,
  TEXTAREA_CLASS,
  buttonClass,
} from "@/components/ui/SettingsControls";
import type { Job } from "@/hooks/useJobs";

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

/** Lifecycle actions under the form: full-width rows, inset to line up with the fields. */
const ROW_ACTION =
  "-mx-3 flex min-h-10 items-center rounded-control px-3 text-left text-ui transition-[transform,background-color] duration-150 enabled:hover:bg-hover enabled:active:scale-[0.99] disabled:opacity-40";

/** A new job started from somewhere else — "Repeat this…" on a message. */
export interface JobDraft {
  name: string;
  prompt: string;
  /** a sentence above the form saying where this came from and what differs */
  origin?: string;
}

export function JobSheet({
  job,
  initial,
  open,
  onClose,
  onSaved,
}: {
  /** absent for a new job */
  job?: Job;
  /** seeds a new job; ignored when editing */
  initial?: JobDraft;
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
          initial={job ? undefined : initial}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Sheet>
  );
}

function JobForm({
  job,
  initial,
  onClose,
  onSaved,
}: {
  job?: Job;
  initial?: JobDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(job?.name ?? initial?.name ?? "");
  const [schedule, setSchedule] = useState(job?.schedule_display ?? "");
  const [prompt, setPrompt] = useState(job?.prompt ?? initial?.prompt ?? "");
  const [skills, setSkills] = useState<string[]>(job?.skills ?? []);
  const [repeat, setRepeat] = useState(
    job?.repeat?.times != null ? String(job.repeat.times) : "",
  );
  /* One control, two shapes. `destination` is "general" when this app
   * delivers it into the General chat, or "hermes" when the gateway posts it,
   * and `deliver` is only meaningful in the second. */
  // A job repeated from a chat reports back into this app by default — the
  // reader started it here, so here is where they expect to see it land.
  const [destination, setDestination] = useState(
    job?.binding ? "general" : job && job.deliver !== "local" ? "hermes" : initial ? "general" : "",
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

    const toGeneral = destination === "general";
    // The route ignores the id and binds to General; the v1 contract still
    // requires one.
    const binding = toGeneral ? { project_id: "general" } : null;
    const payload = {
      name: name.trim(),
      schedule: schedule.trim(),
      prompt,
      // The route forces "local" whenever a job is bound; sending it here
      // too just keeps the request honest about what was asked for.
      deliver: toGeneral ? "local" : destination === "hermes" ? deliver.trim() : "local",
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
    <form onSubmit={save} className="flex flex-col gap-5 p-5">
      {initial?.origin && <p className={HELP_CLASS}>{initial.origin}</p>}
      <div>
        <label htmlFor="job-name" className={LABEL_CLASS}>
          Name
        </label>
        <input
          id="job-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Daily calorie summary"
          className={`mt-2.5 ${FIELD_CLASS}`}
        />
      </div>

      <div>
        <label htmlFor="job-schedule" className={LABEL_CLASS}>
          Schedule
        </label>
        <p className={`mt-0.5 ${HELP_CLASS}`}>{SCHEDULE_HINT}</p>
        <input
          id="job-schedule"
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
          placeholder="0 9 * * *"
          className={`mt-2.5 font-mono ${FIELD_CLASS}`}
        />
        {job?.next_run_at && (
          <p className="mt-1.5 font-mono text-label text-ink-3">
            Next: {new Date(job.next_run_at).toLocaleString()}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="job-prompt" className={LABEL_CLASS}>
          Prompt
        </label>
        <p className={`mt-0.5 ${HELP_CLASS}`}>
          What the agent is asked, every time it fires. It runs unattended, so
          say what to produce rather than asking it to check in.
        </p>
        <textarea
          id="job-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={6}
          placeholder="Summarise today's food log and compare it against the daily targets."
          className={`mt-2.5 ${TEXTAREA_CLASS}`}
        />
      </div>

      <div>
        <span className={LABEL_CLASS}>Skills</span>
        <SkillPicker value={skills} onChange={setSkills} catalogue={catalogue} />
      </div>

      <div>
        <label htmlFor="job-destination" className={LABEL_CLASS}>
          Report to
        </label>
        <p className={`mt-0.5 ${HELP_CLASS}`}>
          One place. A job reporting here lands in the General chat, where you
          can reply to it, and notifies this device; one delivered by Hermes
          goes wherever the gateway sends it and this app stays out of the way.
        </p>
        <select
          id="job-destination"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          className={`mt-2.5 ${FIELD_CLASS}`}
        >
          <option value="">Nowhere — just keep the output on disk</option>
          <option value="general">The General chat in this app</option>
          <optgroup label="Hermes gateway">
            <option value="hermes">A gateway platform…</option>
          </optgroup>
        </select>
      </div>

      {destination === "hermes" && (
        <div>
          <label htmlFor="job-deliver" className={LABEL_CLASS}>
            Gateway target
          </label>
          <p className={`mt-0.5 ${HELP_CLASS}`}>
            A platform like <code>telegram</code>, or one chat in particular:{" "}
            <code>telegram:-100123:17</code>.
          </p>
          <input
            id="job-deliver"
            value={deliver}
            onChange={(event) => setDeliver(event.target.value)}
            placeholder="telegram"
            className={`mt-2.5 font-mono ${FIELD_CLASS}`}
          />
        </div>
      )}

      {/* Create-only. Hermes' PATCH would take the number and overwrite the
        * {times, completed} record with it, which breaks the scheduler's own
        * reads — so an existing job shows its limit and can't change it here. */}
      {job ? (
        <div>
          <span className={LABEL_CLASS}>Runs</span>
          <p className={`mt-0.5 ${HELP_CLASS}`}>
            Fired {job.repeat?.completed ?? 0} time
            {(job.repeat?.completed ?? 0) === 1 ? "" : "s"}
            {job.repeat?.times != null
              ? ` of ${job.repeat.times}. The limit is set when the job is made and can only be changed from the CLI.`
              : ", with no limit."}
          </p>
        </div>
      ) : (
        <div>
          <label htmlFor="job-repeat" className={LABEL_CLASS}>
            Run at most
          </label>
          <p className={`mt-0.5 ${HELP_CLASS}`}>
            Fixed when the job is created — leave it blank unless you mean it.
          </p>
          <input
            id="job-repeat"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="Leave blank to run forever"
            className={`mt-2.5 ${FIELD_CLASS}`}
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
        <div className="flex flex-col gap-0.5 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => void act("run")}
            disabled={busy}
            className={`${ROW_ACTION} text-ink`}
          >
            Run now
          </button>
          <button
            type="button"
            onClick={() => void act(paused ? "resume" : "pause")}
            disabled={busy}
            className={`${ROW_ACTION} text-ink`}
          >
            {paused ? "Resume" : "Pause"}
          </button>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className={`${ROW_ACTION} text-red`}
            >
              Delete job
            </button>
          ) : (
            <div
              className="my-1 rounded-card bg-surface p-4 shadow-card"
              style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
            >
              <p className="text-ui font-semibold text-ink">Delete “{job.name}”?</p>
              <p className="mt-1 text-label text-ink-2">
                Hermes also deletes its own record of every run. What it already
                delivered into the General chat stays there.
              </p>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className={buttonClass("secondary", "sm")}
                >
                  Keep
                </button>
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={busy}
                  className={buttonClass("danger", "sm")}
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClass("secondary")}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !name.trim() || !schedule.trim()}
          className={buttonClass("primary")}
        >
          {busy ? "Saving…" : job ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}
