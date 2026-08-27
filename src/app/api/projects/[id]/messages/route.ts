import { db } from "@/lib/db";
import { messagePageResponse } from "@/lib/project-messages";

export async function GET(request: Request, ctx: RouteContext<"/api/projects/[id]/messages">) {
  const { id } = await ctx.params;
  const project = db.prepare(`SELECT session_id FROM projects WHERE id = ?`).get(id) as
    | { session_id: string }
    | undefined;
  if (!project) return Response.json({ error: "not found" }, { status: 404 });
  return messagePageResponse(request, id, project.session_id);
}
