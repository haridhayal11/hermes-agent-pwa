import { GET as list, POST as create } from "@/app/api/projects/[id]/sessions/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

type Context = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: Context) {
  return withDevice(request, async () => fromLegacy(await list(request, ctx)));
}

export async function POST(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const { id } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `POST:/api/v1/projects/${id}/sessions`,
      async () => fromLegacy(await create(request, ctx)),
    );
  });
}
