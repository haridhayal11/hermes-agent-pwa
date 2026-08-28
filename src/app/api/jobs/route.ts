import { db } from "@/lib/db";
import { hermes, type CreateJobParams, type HermesJob } from "@/lib/hermes";
import { isCronUnavailable, jobErrorResponse } from "@/lib/job-errors";
import { fireKey, setBinding } from "@/lib/cron-watcher";
import { publishChange } from "@/lib/api-changes";
import { ensureScheduledSession } from "@/lib/project-sessions";

// Live proxy: never cached. A zero-argument GET is prerendered at build time
// otherwise, and this one would serve an empty job list forever.
export const dynamic = "force-dynamic";

interface BindingRow {
  job_id: string;
  project_id: string;
}

/** The job as the client sees it: Hermes' object plus where we deliver it. */
function withBindings(jobs: HermesJob[]) {
  const rows = db
    .prepare(
      `SELECT b.job_id, b.project_id, p.name AS project_name
         FROM cron_bindings b JOIN projects p ON p.id = b.project_id`,
    )
    .all() as (BindingRow & { project_name: string })[];
  const byJob = new Map(rows.map((r) => [r.job_id, r]));
  return jobs.map((job) => ({ ...job, binding: byJob.get(job.id) ?? null }));
}

export async function GET() {
  try {
    // include_disabled, always: pause sets enabled:false and the default list
    // hides those, so a paused job would vanish from this screen entirely.
    const { jobs } = await hermes.jobs.list({ includeDisabled: true });
    return Response.json({ jobs: withBindings(jobs) });
  } catch (err) {
    if (isCronUnavailable(err)) {
      return Response.json({ jobs: [], unavailable: true });
    }
    return jobErrorResponse(err);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | (CreateJobParams & { binding?: { project_id?: string } })
    | null;

  if (!body?.name?.trim()) {
    return Response.json({ error: "A name is required" }, { status: 400 });
  }
  if (!body.schedule?.trim()) {
    return Response.json({ error: "A schedule is required" }, { status: 400 });
  }

  const projectId = body.binding?.project_id;
  if (projectId) {
    const project = db
      .prepare(`SELECT id FROM projects WHERE id = ?`)
      .get(projectId);
    if (!project) {
      return Response.json({ error: "unknown project" }, { status: 400 });
    }
  }

  try {
    if (projectId && !(await ensureScheduledSession(projectId))) {
      return Response.json({ error: "unknown project" }, { status: 400 });
    }
    const { job } = await hermes.jobs.create({
      name: body.name.trim(),
      schedule: body.schedule.trim(),
      prompt: body.prompt ?? "",
      /* One destination. A job bound to a project is delivered by this app,
       * which reads the output file Hermes writes regardless — so naming a
       * gateway platform as well would announce the same fire twice. The
       * server decides this rather than trusting the form. */
      deliver: projectId ? "local" : body.deliver?.trim() || "local",
      skills: body.skills?.length ? body.skills : undefined,
      repeat: typeof body.repeat === "number" ? body.repeat : undefined,
    });

    if (projectId) {
      // A job that has never fired stamps "", so its first output delivers.
      setBinding(job.id, projectId, fireKey(job) ?? "");
    }
    publishChange("job.changed", { jobId: job.id });
    return Response.json({ job }, { status: 201 });
  } catch (err) {
    return jobErrorResponse(err);
  }
}
