import { POST as upload } from "@/app/api/upload/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";

export async function POST(request: Request) {
  return withDevice(request, async () => fromLegacy(await upload(request)));
}
