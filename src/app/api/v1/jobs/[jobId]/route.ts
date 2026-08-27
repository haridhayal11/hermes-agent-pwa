import {
  DELETE as remove,
  GET as get,
  PATCH as update,
} from "@/app/api/jobs/[jobId]/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

type Context = { params: Promise<{ jobId: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: Context) {
  return withDevice(request, async () =>
    fromLegacy(
      await get(request, ctx as RouteContext<"/api/jobs/[jobId]">),
    ),
  );
}

export async function PATCH(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const { jobId } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `PATCH:/api/v1/jobs/${jobId}`,
      async () =>
        fromLegacy(
          await update(request, ctx as RouteContext<"/api/jobs/[jobId]">),
        ),
    );
  });
}

export async function DELETE(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const { jobId } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `DELETE:/api/v1/jobs/${jobId}`,
      async () =>
        fromLegacy(
          await remove(request, ctx as RouteContext<"/api/jobs/[jobId]">),
        ),
    );
  });
}
