import { GET as download, POST as probe } from "@/app/api/files/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";

export async function GET(request: Request) {
  return withDevice(request, async () => fromLegacy(await download(request)));
}

export async function POST(request: Request) {
  return withDevice(request, async () => fromLegacy(await probe(request)));
}
