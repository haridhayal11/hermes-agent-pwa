import { db } from "@/lib/db";
import { readGitChanges } from "@/lib/git-changes";

type Context = { params: Promise<{ id: string }> };

/* "What changed" in the project's working directory. A repository this app
 * can't read answers 200 with the reason, not an error status: "not a git
 * repository" is an answer the panel shows, not a failure to recover from. */
export async function GET(_request: Request, ctx: Context) {
  const { id } = await ctx.params;
  const project = db.prepare(`SELECT cwd FROM projects WHERE id = ?`).get(id) as
    | { cwd: string | null }
    | undefined;
  if (!project) return Response.json({ error: "not found" }, { status: 404 });
  if (!project.cwd) {
    return Response.json({ repo: false, reason: "This project has no working directory" });
  }
  return Response.json(await readGitChanges(project.cwd));
}
