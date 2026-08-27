import { createRootSession, listProjectSessions, sessionDto } from "@/lib/project-sessions";
import { hermesErrorResponse } from "@/lib/project-session";
import { runManager } from "@/lib/run-manager";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Context) {
  const { id } = await ctx.params;
  const project = runManager.getProject(id);
  if (!project) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({
    activeSessionId: project.session_id,
    sessions: listProjectSessions(id).map(sessionDto),
  });
}

export async function POST(request: Request, ctx: Context) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { title?: unknown };
  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : "New chat";
  try {
    const session = await createRootSession(id, title);
    if (!session) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ session: sessionDto(session) }, { status: 201 });
  } catch (error) {
    return hermesErrorResponse(error);
  }
}
