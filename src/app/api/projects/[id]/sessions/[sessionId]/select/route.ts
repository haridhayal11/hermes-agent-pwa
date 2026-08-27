import { selectProjectSession, sessionDto } from "@/lib/project-sessions";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function POST(_request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  const session = selectProjectSession(id, sessionId);
  if (!session) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ session: sessionDto(session), activeSessionId: sessionId });
}
