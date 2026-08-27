import { GET as jobs, POST as create } from "@/app/api/jobs/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withDevice(request, async () => fromLegacy(await jobs()));
}

export async function POST(request: Request) {
  return withDevice(request, async (device) =>
    idempotentJson(
      request,
      device.id,
      "POST:/api/v1/jobs",
      async () => fromLegacy(await create(request)),
    ),
  );
}
