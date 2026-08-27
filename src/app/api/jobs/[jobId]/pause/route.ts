import { hermes } from "@/lib/hermes";
import { JOB_ID_RE, jobErrorResponse } from "@/lib/job-errors";
import { getBinding } from "@/lib/cron-watcher";
import { publishChange } from "@/lib/api-changes";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/jobs/[jobId]/pause">,
) {
  const { jobId } = await ctx.params;
  if (!JOB_ID_RE.test(jobId)) {
    return Response.json({ error: "invalid job id" }, { status: 400 });
  }
  try {
    // Pause sets enabled:false upstream, which is why every list call here
    // asks for include_disabled — otherwise the job would look deleted.
    const { job } = await hermes.jobs.pause(jobId);
    publishChange("job.changed", { jobId });
    return Response.json({ job: { ...job, binding: getBinding(jobId) ?? null } });
  } catch (err) {
    return jobErrorResponse(err);
  }
}
