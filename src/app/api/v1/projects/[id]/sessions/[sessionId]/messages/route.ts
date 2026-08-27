import {
  GET as messages,
  POST as send,
} from "@/app/api/projects/[id]/sessions/[sessionId]/messages/route";
import { error, fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(request: Request, ctx: Context) {
  return withDevice(request, async () => fromLegacy(await messages(request, ctx)));
}

export async function POST(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const body = await request.clone().json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return error(400, "invalid_request", "A JSON request body is required.");
    }
    const { id, sessionId } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `POST:/api/v1/projects/${id}/sessions/${sessionId}/messages`,
      async () => fromLegacy(await send(request, ctx)),
    );
  });
}
