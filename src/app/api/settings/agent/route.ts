import { getAgentName, setAgentName } from "@/lib/app-settings";
import { AGENT_NAME_MAX } from "@/lib/branding";
import { publishChange } from "@/lib/api-changes";

// Zero-argument GET: without this Next prerenders it at build time and every
// install serves whatever name the build machine happened to have.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ name: getAgentName() });
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = (body as { name?: unknown })?.name;
  if (typeof name !== "string") {
    return Response.json({ error: "name must be a string" }, { status: 400 });
  }
  const updated = setAgentName(name);
  publishChange("settings.changed", { resource: "agent" });
  return Response.json({ name: updated, max: AGENT_NAME_MAX });
}
