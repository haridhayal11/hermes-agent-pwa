import { HermesApiError } from "@/lib/hermes";
import { forkProjectSession, sessionDto } from "@/lib/project-sessions";
import { runManager } from "@/lib/run-manager";

/**
 * Compatibility endpoint: fork the shared active session into a child session
 * below the same project and select it.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/fork">) {
  const { id } = await ctx.params;
  const project = runManager.getProject(id);
  if (!project) return Response.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const name = typeof body.name === "string" ? body.name.trim() : "";

  let session;
  try {
    session = await forkProjectSession(id, project.session_id, name || undefined);
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

  if (!session) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ session: sessionDto(session) }, { status: 201 });
}
