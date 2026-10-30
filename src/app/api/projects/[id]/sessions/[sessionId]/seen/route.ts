import { markSessionSeen } from "@/lib/activity";
import { getProjectSession } from "@/lib/project-sessions";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function POST(request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { runId?: unknown };
  const runId = typeof body.runId === "string" ? body.runId : undefined;
  if (!getProjectSession(id, sessionId)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ ok: true, marked: markSessionSeen(id, sessionId, runId) });
}
