import { runManager } from "@/lib/run-manager";

export async function POST(_req: Request, ctx: RouteContext<"/api/runs/[id]/stop">) {
  const { id } = await ctx.params;
  try {
    await runManager.stopRun(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "stop failed" },
      { status: 502 },
    );
  }
}
