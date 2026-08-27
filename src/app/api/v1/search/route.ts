import { GET as search } from "@/app/api/search/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";

export async function GET(request: Request) {
  return withDevice(request, async () => fromLegacy(await search(request)));
}
