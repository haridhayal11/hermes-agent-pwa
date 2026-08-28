import { HermesApiError } from "@/lib/hermes";
import { forkProjectSession, getProjectSession, sessionDto } from "@/lib/project-sessions";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function POST(request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  if (getProjectSession(id, sessionId)?.kind === "scheduled") {
    return Response.json({ error: "the Scheduled session cannot be forked" }, { status: 409 });
  }
  const body = (await request.json().catch(() => ({}))) as { title?: unknown };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  try {
    const session = await forkProjectSession(id, sessionId, title || undefined);
    if (!session) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ session: sessionDto(session) }, { status: 201 });
  } catch (error) {
    if (error instanceof HermesApiError && error.status === 404) {
      return Response.json({ error: "session fork is not supported" }, { status: 501 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "fork failed" },
      { status: 502 },
    );
  }
}
