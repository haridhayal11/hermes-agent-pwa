import { POST as retry } from "@/app/api/projects/[id]/sessions/[sessionId]/retry/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function POST(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const { id, sessionId } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `POST:/api/v1/projects/${id}/sessions/${sessionId}/retry`,
      async () => fromLegacy(await retry(request, ctx)),
    );
  });
}
