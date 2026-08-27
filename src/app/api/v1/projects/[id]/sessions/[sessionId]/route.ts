import {
  DELETE as remove,
  GET as get,
  PATCH as update,
} from "@/app/api/projects/[id]/sessions/[sessionId]/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(request: Request, ctx: Context) {
  return withDevice(request, async () => fromLegacy(await get(request, ctx)));
}

export async function PATCH(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const { id, sessionId } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `PATCH:/api/v1/projects/${id}/sessions/${sessionId}`,
      async () => fromLegacy(await update(request, ctx)),
    );
  });
}

export async function DELETE(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const { id, sessionId } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `DELETE:/api/v1/projects/${id}/sessions/${sessionId}`,
      async () => fromLegacy(await remove(request, ctx)),
    );
  });
}
