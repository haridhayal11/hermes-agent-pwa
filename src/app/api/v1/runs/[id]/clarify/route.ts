import { POST as answer } from "@/app/api/runs/[id]/clarify/route";
import { error, fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

type Context = RouteContext<"/api/v1/runs/[id]/clarify">;

export async function POST(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const body = await request.clone().json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return error(400, "invalid_request", "A JSON request body is required.");
    }    const { id } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `POST:/api/v1/runs/${id}/clarify`,
      async () =>
        fromLegacy(
          await answer(
            request,
            ctx as unknown as RouteContext<"/api/runs/[id]/clarify">,
          ),
        ),
    );
  });
}
