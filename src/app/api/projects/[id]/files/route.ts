import { db } from "@/lib/db";
import { listProjectFiles } from "@/lib/project-files";

type Context = { params: Promise<{ id: string }> };

/* The Files panel: what the agent left in the outbox and what was uploaded.
 * Opening one goes through /api/files, whose allowlist covers every root
 * listed here. */
export async function GET(_request: Request, ctx: Context) {
  const { id } = await ctx.params;
  const project = db.prepare(`SELECT cwd FROM projects WHERE id = ?`).get(id) as
    | { cwd: string | null }
    | undefined;
  if (!project) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ files: listProjectFiles(id, project.cwd) });
}
