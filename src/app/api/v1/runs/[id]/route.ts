import { GET as getRun } from "@/app/api/runs/[id]/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";

type Context = RouteContext<"/api/v1/runs/[id]">;

export async function GET(request: Request, ctx: Context) {
  return withDevice(request, async () =>
    fromLegacy(await getRun(request, ctx as unknown as RouteContext<"/api/runs/[id]">)),
  );
}
