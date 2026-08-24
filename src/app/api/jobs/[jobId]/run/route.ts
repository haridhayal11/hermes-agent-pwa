import { hermes } from "@/lib/hermes";
import { JOB_ID_RE, jobErrorResponse } from "@/lib/job-errors";
import { getBinding } from "@/lib/cron-watcher";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/jobs/[jobId]/run">,
) {
  const { jobId } = await ctx.params;
  if (!JOB_ID_RE.test(jobId)) {
    return Response.json({ error: "invalid job id" }, { status: 400 });
  }
  try {
    // Sets next_run_at to now — it fires on the scheduler's next tick, so
    // there is no result to return and nothing to await. The watcher picks the
    // output up like any other fire.
    const { job } = await hermes.jobs.runNow(jobId);
    return Response.json({ job: { ...job, binding: getBinding(jobId) ?? null } });
  } catch (err) {
    return jobErrorResponse(err);
  }
}
