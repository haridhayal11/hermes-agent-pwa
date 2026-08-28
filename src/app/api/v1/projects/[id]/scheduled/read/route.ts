import { POST as readScheduled } from "@/app/api/projects/[id]/scheduled/read/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const { id } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `POST:/api/v1/projects/${id}/scheduled/read`,
      async () => fromLegacy(await readScheduled(request, ctx)),
    );
  });
}
