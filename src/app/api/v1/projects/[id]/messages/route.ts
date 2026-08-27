import { GET as getMessages } from "@/app/api/projects/[id]/messages/route";
import { POST as sendMessage } from "@/app/api/projects/[id]/send/route";
import { error, fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

type Context = RouteContext<"/api/v1/projects/[id]/messages">;

export async function GET(request: Request, ctx: Context) {
  return withDevice(request, async () =>
    fromLegacy(
      await getMessages(
        request,
        ctx as unknown as RouteContext<"/api/projects/[id]/messages">,
      ),
    ),
  );
}

export async function POST(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const body = await request.clone().json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return error(400, "invalid_request", "A JSON request body is required.");
    }
    const { id } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `POST:/api/v1/projects/${id}/messages`,
      async () =>
        fromLegacy(
          await sendMessage(
            request,
            ctx as unknown as RouteContext<"/api/projects/[id]/send">,
          ),
        ),
    );
  });
}
