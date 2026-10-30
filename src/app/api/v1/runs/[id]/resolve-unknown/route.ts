import { POST as resolve } from "@/app/api/runs/[id]/resolve-unknown/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

type Context = RouteContext<"/api/v1/runs/[id]/resolve-unknown">;

export async function POST(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const { id } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `POST:/api/v1/runs/${id}/resolve-unknown`,
      async () =>
        fromLegacy(
          await resolve(
            request,
            ctx as unknown as RouteContext<"/api/runs/[id]/resolve-unknown">,
          ),
        ),
    );
  });
}
