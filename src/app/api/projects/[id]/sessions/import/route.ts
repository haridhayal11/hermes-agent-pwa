import { hermesForProject } from "@/lib/bots";
import { HermesApiError } from "@/lib/hermes";
import { adoptSession, sessionDto } from "@/lib/project-sessions";
import { db } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

/* Attaches an existing Hermes session to this project as one of its chats.
 * The id is checked against the project's own profile first: a session from
 * another profile's database would accept no runs from this project. */
export async function POST(request: Request, ctx: Context) {
  const { id } = await ctx.params;
  if (!db.prepare(`SELECT id FROM projects WHERE id = ?`).get(id)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) return Response.json({ error: "sessionId is required" }, { status: 400 });

  let session;
  try {
    session = await hermesForProject(id).getSession(sessionId);
  } catch (error) {
    if (error instanceof HermesApiError && error.status === 404) {
      return Response.json({ error: "Hermes has no session with that id" }, { status: 404 });
    }
    return Response.json({ error: "Hermes didn't answer" }, { status: 502 });
  }

  const result = adoptSession(id, { ...session, id: sessionId });
  switch (result.kind) {
    case "general":
      return Response.json(
        { error: "General keeps a single chat", code: "general_single_chat" },
        { status: 409 },
      );
    case "attached":
      return Response.json(
        {
          error:
            result.projectId === id
              ? "That chat is already in this project"
              : `That chat already belongs to ${result.projectName}`,
          code: "session_attached",
          projectId: result.projectId,
        },
        { status: 409 },
      );
    case "adopted":
      return Response.json({ session: sessionDto(result.session) }, { status: 201 });
  }
}
