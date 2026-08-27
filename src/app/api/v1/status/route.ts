import { GET as getStatus } from "@/app/api/status/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withDevice(request, async () => fromLegacy(await getStatus()));
}
