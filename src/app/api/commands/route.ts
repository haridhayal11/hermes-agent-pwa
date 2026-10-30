import { gatewayCommandsAvailable } from "@/lib/hermes-gateway";

// Live probe: never cached. Without this Next prerenders a GET handler that
// reads nothing from the request and serves the build-time answer forever.
export const dynamic = "force-dynamic";

/** Whether the gateway will run slash commands for this app, and for which
 *  Bot (`?bot=<profile>`). The composer's menu offers the gateway's commands
 *  only when it will. */
export async function GET(request: Request) {
  const bot = new URL(request.url).searchParams.get("bot");
  return Response.json(await gatewayCommandsAvailable(bot || null));
}
