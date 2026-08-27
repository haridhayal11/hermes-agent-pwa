import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { APP_SLUG } from "./branding";
import { db } from "./db";
import { hermes, type HermesJob } from "./hermes";
import { runManager } from "./run-manager";
import { sendToAll } from "./push";

/* Scheduled jobs, delivered into a project.
 *
 * Hermes owns the schedule — these are the same jobs the CLI and Telegram
 * see, and nothing here writes to the scheduler. What this module owns is the
 * last mile, because Hermes has no way to deliver to us: `deliver` resolves
 * against a fixed set of gateway platforms (telegram, discord, slack, …) plus
 * plugins declaring `cron_deliver_env_var`, and a PWA is none of those. The
 * `webhook` platform looks like an opening and isn't — its adapter only knows
 * how to answer a request it received, so a cron-supplied target finds no
 * delivery info and the response is written to a log line.
 *
 * The way in is that Hermes saves every job's output to disk *before* it tries
 * to deliver it, whatever `deliver` says (cron/jobs.py `save_job_output`,
 * called from `run_job`). This app runs on the same host as the gateway by
 * construction — that is the whole reason the middle tier exists — so the file
 * is simply there to be read.
 *
 * The consequence worth stating: a binding is not a delivery target. Binding a
 * project to a job that already posts to Telegram adds this app to it rather than
 * taking Telegram away, because we never touch the job's `deliver` field.
 */

const POLL_MS = 30_000;

/** Where the gateway keeps its cron state. Same host, by construction. */
export function cronDir(): string {
  return (
    process.env.HERMES_CRON_DIR ||
    path.join(os.homedir(), ".hermes", "cron")
  );
}

function outputDirFor(jobId: string): string {
  return path.join(cronDir(), "output", jobId);
}

export interface CronBinding {
  job_id: string;
  project_id: string;
  last_seen_at: string | null;
  created_at: number;
}

export interface CronDelivery {
  id: string;
  job_id: string;
  project_id: string;
  session_id: string;
  job_name: string;
  status: "ok" | "failed";
  body: string;
  source_path: string | null;
  ts: number;
}

/**
 * The identity of a fire: the file it wrote.
 *
 * This was a timestamp — `latest_execution.finished_at`, falling back to
 * `last_run_at` — and that was wrong in a way it took real deliveries to
 * find. Those two fields describe the same fire but differ by a few
 * milliseconds, and `latest_execution` is not on every response, so a fire
 * could be stamped from one field and compared against the other. It then
 * looked new forever: binding a job that last ran on Friday delivered
 * Friday's report on Monday, twice.
 *
 * The output file is the honest key. There is exactly one per fire, its name
 * is minted when the fire happens, and it is the very thing being read.
 */
export function fireKey(job: HermesJob): string | null {
  return newestOutputFile(job.id);
}

/** A legacy `last_seen_at` is an ISO timestamp; the current one is a path. */
function isPathStamp(value: string): boolean {
  return value.startsWith("/");
}

/** Milliseconds for the fire, from whichever timestamp the job carries. */
function firedAt(job: HermesJob): number {
  const raw = job.latest_execution?.finished_at || job.last_run_at;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

/**
 * The delivered half of an output file.
 *
 * The file is a whole report: a header, then `## Prompt` with the prompt
 * inlined — including the full text of any skill the job loads, which runs to
 * hundreds of lines — then `## Response`. Failures are titled `(FAILED)` and
 * end in `## Error` instead.
 *
 * Split on the *last* heading, not the first: skills are pasted into the
 * prompt verbatim and one of them may well contain a `## Response` of its own.
 */
export function parseJobOutput(markdown: string): {
  status: "ok" | "failed";
  body: string;
} {
  const failed = /^#\s+Cron Job:.*\(FAILED\)\s*$/m.test(markdown);
  const heading = failed ? "\n## Error\n" : "\n## Response\n";
  const at = markdown.lastIndexOf(heading);
  const body = at === -1 ? markdown : markdown.slice(at + heading.length);
  return { status: failed ? "failed" : "ok", body: body.trim() };
}

/**
 * Whether the agent chose to say nothing.
 *
 * Cron's contract is looser than the gateway's exact-whole-response rule —
 * the cron system prompt asks for "[SILENT]" and models routinely bracket it
 * with a stray newline — so a marker counts as silence when it is the whole
 * response or its own first or last line. A token buried mid-sentence is real
 * content, which is why this cannot just be a substring test.
 */
export function isSilent(text: string): boolean {
  const tokens = new Set(["[SILENT]", "SILENT", "NO_REPLY", "NO REPLY"]);
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (tokens.has(trimmed.toUpperCase())) return true;
  const lines = trimmed.split("\n").map((l) => l.trim().toUpperCase());
  return tokens.has(lines[0]) || tokens.has(lines[lines.length - 1]);
}

/**
 * Markdown markers off, for a notification.
 *
 * A push body is plain text on every platform — there is nowhere for `**` to
 * render — and these reports are written for Telegram, so they are full of it.
 * Fences go entirely; inline markers are unwrapped rather than deleted, so
 * `**376 kcal over**` reads as "376 kcal over" and not as "376 kcal over"
 * with the asterisks still attached.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/(\*\*|__)([^*_\n]+)\1/g, "$2")
    .replace(/(\*|_|`)([^*_`\n]+)\1/g, "$2")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The newest output file for a job. Hermes names them
 * `YYYY-MM-DD_HH-MM-SS.md`, so lexical order is chronological — worth
 * preferring over mtime, which an rsync or a backup restore can rewrite.
 */
function newestOutputFile(jobId: string): string | null {
  const dir = outputDirFor(jobId);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const candidates = entries.filter((f) => f.endsWith(".md")).sort();
  const newest = candidates[candidates.length - 1];
  return newest ? path.join(dir, newest) : null;
}

export function listBindings(): CronBinding[] {
  return db
    .prepare(`SELECT * FROM cron_bindings`)
    .all() as CronBinding[];
}

export function getBinding(jobId: string): CronBinding | undefined {
  return db.prepare(`SELECT * FROM cron_bindings WHERE job_id = ?`).get(jobId) as
    | CronBinding
    | undefined;
}

/**
 * Binds a job to a project.
 *
 * `lastSeenAt` carries the file of the job's *current* last fire, so binding a
 * job that has been running for months does not dump its back-issues into the
 * thread. A brand-new job has never fired and passes `""` — no file matches
 * it, so the first one delivers. Null makes the watcher adopt whatever it
 * finds without delivering it.
 */
export function setBinding(
  jobId: string,
  projectId: string,
  lastSeenAt: string | null,
) {
  db.prepare(
    `INSERT INTO cron_bindings (job_id, project_id, last_seen_at, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET project_id = excluded.project_id`,
  ).run(jobId, projectId, lastSeenAt, Date.now());
}

export function clearBinding(jobId: string) {
  db.prepare(`DELETE FROM cron_bindings WHERE job_id = ?`).run(jobId);
}

/**
 * Scoped to the session the project currently points at, for the same reason
 * `getLatestRun` is: `/new` leaves the old rows in place, and an unscoped read
 * would replay a discarded thread's deliveries into the empty one.
 */
export function deliveriesFor(projectId: string, sessionId: string): CronDelivery[] {
  return db
    .prepare(
      `SELECT * FROM cron_deliveries
        WHERE project_id = ? AND session_id = ? ORDER BY ts ASC`,
    )
    .all(projectId, sessionId) as CronDelivery[];
}

async function deliver(job: HermesJob, binding: CronBinding, file: string) {
  const project = db
    .prepare(`SELECT name, session_id FROM projects WHERE id = ?`)
    .get(binding.project_id) as { name: string; session_id: string } | undefined;
  // The binding is ON DELETE CASCADE, so this only happens in the window
  // between a project being deleted and the tick that noticed.
  if (!project) return;

  /* turbopackIgnore silences the build-time warning about dynamic filesystem
   * access. The path genuinely is dynamic and genuinely is outside the
   * project — it belongs to the gateway, not to us — so the suggested fix of
   * scoping it under process.cwd() doesn't apply. Without the comment the
   * tracer pulls the whole source tree into the server output on every build. */
  const { status, body } = parseJobOutput(
    fs.readFileSync(/* turbopackIgnore: true */ file, "utf8"),
  );
  if (status === "ok" && isSilent(body)) return;

  const delivery: CronDelivery = {
    id: `cd_${randomUUID()}`,
    job_id: job.id,
    project_id: binding.project_id,
    session_id: project.session_id,
    job_name: job.name,
    status,
    body,
    source_path: file,
    ts: firedAt(job),
  };

  // OR IGNORE against the unique index on (job_id, source_path): the stamp is
  // written after the insert, so a crash in between replays the fire, and two
  // processes overlapping across a restart would otherwise both take it. One
  // file, one message, whatever happens above.
  const inserted = db.prepare(
    `INSERT OR IGNORE INTO cron_deliveries
       (id, job_id, project_id, session_id, job_name, status, body, source_path, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    delivery.id,
    delivery.job_id,
    delivery.project_id,
    delivery.session_id,
    delivery.job_name,
    delivery.status,
    delivery.body,
    delivery.source_path,
    delivery.ts,
  );
  if (inserted.changes === 0) return;

  const activeAt = Date.now();
  db.transaction(() => {
    db.prepare(`UPDATE projects SET last_active_at = ? WHERE id = ?`).run(
      activeAt,
      binding.project_id,
    );
    db.prepare(
      `UPDATE project_sessions SET last_active_at = ? WHERE session_id = ?`,
    ).run(activeAt, project.session_id);
  })();

  // Live, for a thread that happens to be open. The durable copy is the row
  // above, which the history route merges back in on reload.
  runManager.emitProject(binding.project_id, { event: "cron.delivered", delivery });

  /* Always. A bound job delivers here and nowhere else — the routes force
   * `deliver: "local"` on it — so this is the only thing that will announce
   * the fire. Whether this device wants job notifications at all is a
   * per-device question, and Settings → Notifications is where it is asked. */
  await sendToAll({
    title: project.name,
    body:
      status === "failed"
        ? `${job.name} failed.`
        : `${job.name}: ${plainText(body).slice(0, 140)}`,
    url: `/p/${binding.project_id}/s/${project.session_id}`,
    // Its own tag: a scheduled result arriving overnight must not silently
    // replace the notification for the run you were watching before bed.
    tag: `${APP_SLUG}-job-${binding.project_id}`,
    kind: status === "failed" ? "job-failed" : "job",
  });
}

/** One pass. Exported so a route can force a check without waiting 30s. */
export async function tick(): Promise<void> {
  const bindings = listBindings();
  if (bindings.length === 0) return;

  // include_disabled is not optional: pause sets enabled:false and the default
  // list drops those, so a paused job would look deleted and its binding would
  // be skipped for as long as it stayed paused.
  const { jobs } = await hermes.jobs.list({ includeDisabled: true });
  const byId = new Map(jobs.map((job) => [job.id, job]));

  for (const binding of bindings) {
    const job = byId.get(binding.job_id);
    // The job was deleted in the CLI, or this gateway isn't the one that has
    // it. Leave the binding — the deliveries it already made are still real,
    // and the jobs screen shows it as missing rather than silently dropping it.
    if (!job) continue;

    const fired = fireKey(job);
    if (!fired || fired === binding.last_seen_at) continue;

    try {
      /* Deliver unless this binding has never resolved a real fire. Two cases
       * adopt silently instead: a row written with no stamp at all, and a row
       * still carrying the old timestamp stamp, which cannot be compared
       * against a path and would otherwise re-deliver whatever is newest. */
      const adopt =
        binding.last_seen_at === null ||
        (binding.last_seen_at !== "" && !isPathStamp(binding.last_seen_at));
      if (!adopt) await deliver(job, binding, fired);
    } catch (err) {
      console.error(`[cron] delivery failed for job ${job.id}:`, err);
      // Deliberately no stamp: leaving last_seen_at behind means the next tick
      // retries. A duplicate message is a better failure than a lost one.
      continue;
    }

    db.prepare(`UPDATE cron_bindings SET last_seen_at = ? WHERE job_id = ?`).run(
      fired,
      binding.job_id,
    );
  }
}

// Same globalThis pin as the run manager and the database handle: Next dev's
// HMR reloads this module on every edit, and a module-level interval would
// leave a second poller behind each time.
const globalForCron = globalThis as unknown as {
  __hermesPwaCronWatcher?: ReturnType<typeof setInterval>;
};

export function startCronWatcher() {
  if (globalForCron.__hermesPwaCronWatcher) return;

  const run = () => {
    void tick().catch((err) => {
      // Hermes being down, or having no cron module at all (501), is a normal
      // state — the poller must survive it and try again rather than die once
      // and leave every binding dark until the next deploy.
      console.error("[cron] tick failed:", err);
    });
  };

  const timer = setInterval(run, POLL_MS);
  // Never the reason the process stays alive.
  timer.unref?.();
  globalForCron.__hermesPwaCronWatcher = timer;
  // One line at boot, so `journalctl -u hermes-pwa` can answer "is the watcher
  // even running" without a job having to fire first.
  console.log(`[cron] watching ${cronDir()} every ${POLL_MS / 1000}s`);
  run();
}
