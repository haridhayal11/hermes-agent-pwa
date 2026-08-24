import { hermes } from "@/lib/hermes";
import { runManager } from "@/lib/run-manager";

export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/retry">) {
  const { id } = await ctx.params;
  const project = runManager.getProject(id);
  if (!project) return Response.json({ error: "not found" }, { status: 404 });
  if (runManager.getActiveRun(id)) {
    return Response.json({ error: "a run is already active" }, { status: 409 });
  }

  const res = await hermes.getMessages(project.session_id);
  const lastUserMessage = [...res.data]
    .reverse()
    .find((m) => m.role === "user" && typeof m.content === "string" && m.content.length > 0);
  if (!lastUserMessage) {
    return Response.json({ error: "no prior message to retry" }, { status: 400 });
  }

  const result = await runManager.sendMessage(id, lastUserMessage.content as string);
  return Response.json(result, { status: 202 });
}
