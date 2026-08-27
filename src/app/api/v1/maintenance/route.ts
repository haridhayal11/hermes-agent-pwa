import { GET as inspect, POST as prune } from "@/app/api/maintenance/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withDevice(request, async () => fromLegacy(await inspect()));
}

export async function POST(request: Request) {
  return withDevice(request, async (device) =>
    idempotentJson(
      request,
      device.id,
      "POST:/api/v1/maintenance",
      async () => fromLegacy(await prune(request)),
    ),
  );
}
