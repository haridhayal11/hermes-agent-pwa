import { POST as resume } from "@/app/api/jobs/[jobId]/resume/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

type Context = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const { jobId } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `POST:/api/v1/jobs/${jobId}/resume`,
      async () =>
        fromLegacy(
          await resume(request, ctx as RouteContext<"/api/jobs/[jobId]/resume">),
        ),
    );
  });
}
