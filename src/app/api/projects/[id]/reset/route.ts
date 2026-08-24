import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createProjectSession, hermesErrorResponse } from "@/lib/project-session";
import { runManager } from "@/lib/run-manager";

/**
 * `/new` — point the project at a fresh Hermes session.
 *
 * The title has to go through createProjectSession, not hermes.createSession:
 * Hermes session titles are globally unique, and the session we are replacing
 * still owns this project's name. Creating the replacement under the same
 * title is therefore *guaranteed* to fail with `invalid_title` — which is what
 * made /new fail every single time it was used.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/reset">) {
  const { id } = await ctx.params;
  const project = runManager.getProject(id);
  if (!project) return Response.json({ error: "not found" }, { status: 404 });
  if (runManager.getActiveRun(id)) {
    return Response.json({ error: "a run is active; stop it first" }, { status: 409 });
  }

  // `/new [name]` titles the new session. The project keeps its own name —
  // renaming the project is /title.
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const title = typeof body.name === "string" && body.name.trim()
    ? body.name.trim()
    : project.name;

  const newSessionId = `${id}__r${randomUUID().slice(0, 8)}`;
  try {
    await createProjectSession(newSessionId, title);
  } catch (err) {
    return hermesErrorResponse(err);
  }

  db.prepare(`UPDATE projects SET session_id = ? WHERE id = ?`).run(newSessionId, id);

  const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  return Response.json({ project: updated });
}
