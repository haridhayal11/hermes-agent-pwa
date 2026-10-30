import { GET as getCommands } from "@/app/api/commands/route";
import { fromLegacy, withDevice } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withDevice(request, async () => fromLegacy(await getCommands(request)));
}
