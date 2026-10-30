import { HermesApiError } from "@/lib/hermes";
import { PromptNotPendingError, runManager } from "@/lib/run-manager";

/** Acknowledges a run Hermes lost the owner of, so its chat can continue. */
export async function POST(_req: Request, ctx: RouteContext<"/api/runs/[id]/resolve-unknown">) {
  const { id } = await ctx.params;
  if (!runManager.getRun(id)) {
    return Response.json({ error: "run not found" }, { status: 404 });
  }
  try {
    const result = await runManager.resolveUnknown(id);
    return Response.json({ ok: true, receipt: result });
  } catch (err) {
    if (err instanceof PromptNotPendingError) {
      return Response.json({ error: "Hermes does not report this run as unknown" }, { status: 409 });
    }
    if (err instanceof HermesApiError && err.status === 404) {
      return Response.json({ error: "Hermes no longer knows this run" }, { status: 404 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "resolve failed" },
      { status: 502 },
    );
  }
}
