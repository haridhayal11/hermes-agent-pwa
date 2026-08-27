import { hermes } from "@/lib/hermes";
import { getProjectSession } from "@/lib/project-sessions";
import { runManager } from "@/lib/run-manager";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function POST(_request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  if (!getProjectSession(id, sessionId)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  if (runManager.getActiveRun(id, sessionId)) {
    return Response.json({ error: "a run is already active" }, { status: 409 });
  }
  const response = await hermes.getMessages(sessionId);
  const last = [...response.data]
    .reverse()
    .find(
      (message) =>
        message.role === "user" &&
        typeof message.content === "string" &&
        message.content.length > 0,
    );
  if (!last) {
    return Response.json({ error: "no prior message to retry" }, { status: 400 });
  }
  const result = await runManager.sendMessage(id, last.content as string, [], { sessionId });
  return Response.json({ ...result, sessionId }, { status: 202 });
}
