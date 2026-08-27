import { db } from "@/lib/db";
import { hermesErrorResponse } from "@/lib/project-session";
import { createRootSession, sessionDto } from "@/lib/project-sessions";
import { runManager } from "@/lib/run-manager";

/**
 * Compatibility endpoint for `/new`: create a durable root beneath this
 * project and select it. The old transcript remains in the shared tree.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/reset">) {
  const { id } = await ctx.params;
  const project = runManager.getProject(id);
  if (!project) return Response.json({ error: "not found" }, { status: 404 });
  // `/new [name]` titles the new session. The project keeps its own name —
  // renaming the project is /title.
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const title =
    typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New chat";

  let session;
  try {
    session = await createRootSession(id, title);
  } catch (err) {
    return hermesErrorResponse(err);
  }
  if (!session) return Response.json({ error: "not found" }, { status: 404 });

  const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  return Response.json({ project: updated, session: sessionDto(session) }, { status: 201 });
}
