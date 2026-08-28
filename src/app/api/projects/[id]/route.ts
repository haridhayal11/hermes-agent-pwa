import { db } from "@/lib/db";
import { hermes, HermesApiError } from "@/lib/hermes";
import { publishChange } from "@/lib/api-changes";
import { listProjectSessions, withProjectNavigation } from "@/lib/project-sessions";

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | { id: string; session_id: string }
    | undefined;
  if (!project) return Response.json({ error: "not found" }, { status: 404 });

  // Message count is only worth surfacing so the delete confirmation can say
  // what is about to be destroyed. A failure here must not 500 the route.
  let messageCount: number | null = null;
  try {
    const session = await hermes.getSession(project.session_id);
    const raw = session.message_count;
    if (typeof raw === "number") messageCount = raw;
  } catch {
    /* Hermes unreachable — the sheet just omits the count */
  }
  return Response.json({ project: withProjectNavigation(project), messageCount });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | { id: string; session_id: string }
    | undefined;
  if (!project) return Response.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (typeof body.name === "string") {
    updates.push("name = ?");
    values.push(body.name);
  }
  if (typeof body.emoji === "string" || body.emoji === null) {
    updates.push("emoji = ?");
    values.push(body.emoji);
  }
  if (typeof body.color === "string" || body.color === null) {
    updates.push("color = ?");
    values.push(body.color);
  }
  if (typeof body.archived === "boolean") {
    updates.push("archived = ?");
    values.push(body.archived ? 1 : 0);
  }
  // Takes effect on the next run — instructions are composed at send time.
  if (typeof body.instructions === "string" || body.instructions === null) {
    updates.push("instructions = ?");
    values.push(body.instructions);
  }
  if (typeof body.cwd === "string" || body.cwd === null) {
    updates.push("cwd = ?");
    values.push(body.cwd);
  }
  if (typeof body.pinned === "boolean") {
    updates.push("pinned = ?");
    values.push(body.pinned ? 1 : 0);
  }
  if (Array.isArray(body.skills)) {
    const skills = body.skills.filter(
      (s: unknown): s is string => typeof s === "string" && !!s.trim(),
    );
    updates.push("skills = ?");
    values.push(skills.length ? JSON.stringify(skills) : null);
  }
  // Model selection. null clears the override and hands the choice back to the
  // gateway default; the three move together so a half-set row can't send a
  // model to the wrong provider.
  if ("model" in body) {
    const model = typeof body.model === "string" && body.model ? body.model : null;
    const provider =
      typeof body.provider === "string" && body.provider ? body.provider : null;
    updates.push("model = ?", "provider = ?");
    values.push(model, model ? provider : null);
  }
  if ("model_options" in body) {
    const raw = body.model_options;
    const ok = raw && typeof raw === "object" && !Array.isArray(raw)
      && Object.keys(raw as object).length > 0;
    updates.push("model_options = ?");
    values.push(ok ? JSON.stringify(raw) : null);
  }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE projects SET ${updates.join(", ")} WHERE id = ?`).run(
      ...(values as []),
    );
  }

  const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  if (updates.length > 0) publishChange("project.changed", { projectId: id });
  return Response.json({
    project: withProjectNavigation(updated as { id: string }),
  });
}

/**
 * DELETE /api/projects/[id]
 *
 *   (no params)             archive — hides it, keeps everything
 *   ?purge=1                drop the project and its local run history
 *   ?purge=1&session=1      also delete the Hermes conversation
 *
 * The Hermes session is preserved by default: it holds the actual transcript
 * and is still reachable from the CLI and every other Hermes client, so
 * removing a project from this app should not destroy it.
 */
export async function DELETE(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | { id: string; session_id: string }
    | undefined;
  if (!project) return Response.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const purge = url.searchParams.get("purge") === "1";
  const dropSession = url.searchParams.get("session") === "1";

  if (!purge) {
    db.prepare(`UPDATE projects SET archived = 1 WHERE id = ?`).run(id);
    publishChange("project.changed", { projectId: id });
    return Response.json({ ok: true, archived: true });
  }

  let sessionDeleted = false;
  if (dropSession) {
    const sessions = listProjectSessions(id, true);
    for (const session of [...sessions].reverse()) {
      try {
        await hermes.deleteSession(session.session_id);
      } catch (error) {
        if (error instanceof HermesApiError && error.status === 404) continue;
        // Leave the local rows alone if every transcript could not be removed.
        // A retry is safe because Hermes answers 404 for already deleted rows.
        return Response.json(
          { error: "Could not delete every Hermes conversation" },
          { status: 502 },
        );
      }
    }
    sessionDeleted = true;
  }

  // run_events has no project_id and no foreign key, so it has to go first.
  db.transaction(() => {
    db.prepare(
      `DELETE FROM run_events WHERE run_id IN (SELECT run_id FROM runs WHERE project_id = ?)`,
    ).run(id);
    db.prepare(`DELETE FROM runs WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM queued_messages WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  })();

  publishChange("project.deleted", { projectId: id });

  return Response.json({ ok: true, deleted: true, sessionDeleted });
}
