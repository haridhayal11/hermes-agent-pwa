import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { hermes, HermesApiError } from "@/lib/hermes";
import { runManager } from "@/lib/run-manager";

/**
 * Branch a project.
 *
 * POST /api/sessions/{id}/fork copies the session's lineage upstream, so the
 * fork opens with the whole transcript behind it and then diverges. The local
 * half is a new project row carrying everything that makes a project a
 * project — emoji, colour, cwd, instructions, linked skills, model choice —
 * pointed at the forked session.
 *
 * This is the one way to get a second thread out of a project without a "new
 * chat" button: the branch is a new project, so one-chat-per-project holds.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/fork">) {
  const { id } = await ctx.params;
  const project = runManager.getProject(id);
  if (!project) return Response.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  const name = rawName || `${project.name} (branch)`;

  const suffix = randomUUID().slice(0, 8);
  const forkId = `${id}__f${suffix}`;

  let sessionId: string;
  try {
    const session = await hermes.forkSession(project.session_id, {
      id: forkId,
      title: name,
    });
    // Hermes decides the fork's id; ours was only a request.
    sessionId = typeof session?.id === "string" && session.id ? session.id : forkId;
  } catch (err) {
    if (err instanceof HermesApiError && err.status === 404) {
      return Response.json(
        { error: "this Hermes has no session fork endpoint" },
        { status: 501 },
      );
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "fork failed" },
      { status: 502 },
    );
  }

  const now = Date.now();
  db.prepare(
    `INSERT INTO projects
       (id, name, emoji, color, cwd, instructions, pinned, skills, model, provider, model_options,
        session_id, created_at, last_active_at, archived)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(
    forkId,
    name,
    project.emoji ?? null,
    project.color ?? null,
    project.cwd,
    project.instructions,
    project.skills,
    project.model,
    project.provider,
    project.model_options,
    sessionId,
    now,
    now,
  );

  const created = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(forkId);
  return Response.json({ project: created }, { status: 201 });
}
