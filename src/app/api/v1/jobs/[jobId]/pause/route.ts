import { POST as pause } from "@/app/api/jobs/[jobId]/pause/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

type Context = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const { jobId } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `POST:/api/v1/jobs/${jobId}/pause`,
      async () =>
        fromLegacy(
          await pause(request, ctx as RouteContext<"/api/jobs/[jobId]/pause">),
        ),
    );
  });
}
