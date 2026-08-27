import { GET as getAgent, PUT as putAgent } from "@/app/api/settings/agent/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withDevice(request, async () => fromLegacy(await getAgent()));
}

export async function PUT(request: Request) {
  return withDevice(request, async (device) =>
    idempotentJson(
      request,
      device.id,
      "PUT:/api/v1/settings/agent",
      async () => fromLegacy(await putAgent(request)),
    ),
  );
}
