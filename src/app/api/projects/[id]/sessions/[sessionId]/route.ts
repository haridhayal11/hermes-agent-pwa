import { hermes } from "@/lib/hermes";
import {
  deleteSessionSubtree,
  getProjectSession,
  renameSession,
  sessionDto,
  sessionSubtree,
} from "@/lib/project-sessions";
import { hermesErrorResponse } from "@/lib/project-session";
import { runManager } from "@/lib/run-manager";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(_request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  const session = getProjectSession(id, sessionId);
  if (!session) return Response.json({ error: "not found" }, { status: 404 });
  let messageCount: number | null = null;
  try {
    const upstream = await hermes.getSession(sessionId);
    if (typeof upstream.message_count === "number") messageCount = upstream.message_count;
  } catch {
    // Metadata remains usable while Hermes is temporarily unavailable.
  }
  return Response.json({ session: sessionDto(session), messageCount });
}

export async function PATCH(request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  try {
    const session = await renameSession(id, sessionId, body.title);
    if (!session) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ session: sessionDto(session) });
  } catch (error) {
    return hermesErrorResponse(error);
  }
}

export async function DELETE(_request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  const subtree = sessionSubtree(id, sessionId);
  if (subtree.some((session) => runManager.getActiveRun(id, session.session_id))) {
    return Response.json({ error: "stop active runs in this branch first" }, { status: 409 });
  }
  try {
    const result = await deleteSessionSubtree(id, sessionId);
    if (result.kind === "not_found") {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    if (result.kind === "last_session") {
      return Response.json(
        { error: "a project must keep at least one session" },
        { status: 409 },
      );
    }
    return Response.json({ ok: true, activeSessionId: result.sessionId });
  } catch (error) {
    return hermesErrorResponse(error);
  }
}
