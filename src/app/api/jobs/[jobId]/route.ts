import { db } from "@/lib/db";
import { hermes, type UpdateJobParams } from "@/lib/hermes";
import { JOB_ID_RE, jobErrorResponse } from "@/lib/job-errors";
import { clearBinding, fireKey, getBinding, setBinding } from "@/lib/cron-watcher";

export const dynamic = "force-dynamic";

function badId() {
  return Response.json({ error: "invalid job id" }, { status: 400 });
}

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[jobId]">) {
  const { jobId } = await ctx.params;
  if (!JOB_ID_RE.test(jobId)) return badId();
  try {
    const { job } = await hermes.jobs.get(jobId);
    return Response.json({ job: { ...job, binding: getBinding(jobId) ?? null } });
  } catch (err) {
    return jobErrorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/jobs/[jobId]">) {
  const { jobId } = await ctx.params;
  if (!JOB_ID_RE.test(jobId)) return badId();

  const body = (await request.json().catch(() => null)) as
    | (UpdateJobParams & {
        repeat?: number;
        binding?: { project_id?: string | null } | null;
      })
    | null;
  if (!body) return Response.json({ error: "invalid body" }, { status: 400 });

  // Hermes filters the body against its own whitelist and answers 400 when
  // nothing survives, so anything outside this set is silently dropped
  // upstream. Sending only what it accepts keeps that failure impossible.
  const patch: UpdateJobParams = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.schedule === "string") patch.schedule = body.schedule.trim();
  if (typeof body.prompt === "string") patch.prompt = body.prompt;
  /* One destination: binding a project forces Hermes' own delivery off, so a
   * fire is announced once. Decided here rather than in the sheet, so the rule
   * holds for any caller. */
  if (body.binding?.project_id) patch.deliver = "local";
  else if (typeof body.deliver === "string") patch.deliver = body.deliver.trim();
  if (Array.isArray(body.skills)) patch.skills = body.skills;
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  // `repeat` is never forwarded. Hermes' whitelist admits it, but a job stores
  // it as {times, completed} and update_job merges with {**job, **updates} —
  // sending the number would replace the dict and break every later read of
  // repeat.times in the scheduler.

  try {
    const job = Object.keys(patch).length
      ? (await hermes.jobs.update(jobId, patch)).job
      : (await hermes.jobs.get(jobId)).job;

    // `binding: null` unbinds; an object rebinds. Absent means "leave it" —
    // editing a job's prompt should not quietly change where it lands.
    if (body.binding === null) {
      clearBinding(jobId);
    } else if (body.binding?.project_id) {
      const project = db
        .prepare(`SELECT id FROM projects WHERE id = ?`)
        .get(body.binding.project_id);
      if (!project) {
        return Response.json({ error: "unknown project" }, { status: 400 });
      }
      // Only stamp on a *new* binding. Re-stamping an existing one on every
      // save would swallow a fire that landed between the edit and the save.
      const existing = getBinding(jobId);
      setBinding(
        jobId,
        body.binding.project_id,
        existing ? existing.last_seen_at : (fireKey(job) ?? ""),
      );
    }

    return Response.json({ job: { ...job, binding: getBinding(jobId) ?? null } });
  } catch (err) {
    return jobErrorResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/jobs/[jobId]">) {
  const { jobId } = await ctx.params;
  if (!JOB_ID_RE.test(jobId)) return badId();
  try {
    await hermes.jobs.remove(jobId);
    // Hermes rmtree's its own output directory here. The delivered bodies in
    // cron_deliveries are deliberately left alone — they are already part of
    // the thread, and deleting the schedule is not deleting the history.
    clearBinding(jobId);
    return Response.json({ ok: true });
  } catch (err) {
    return jobErrorResponse(err);
  }
}
