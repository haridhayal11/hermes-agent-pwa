import { runManager } from "@/lib/run-manager";

const ALLOWED_CHOICES = new Set(["once", "session", "always", "deny"]);

export async function POST(req: Request, ctx: RouteContext<"/api/runs/[id]/approval">) {
  const { id } = await ctx.params;
  const body = await req.json();
  const choice = body.choice;
  if (!ALLOWED_CHOICES.has(choice)) {
    return Response.json(
      { error: "choice must be one of: once, session, always, deny" },
      { status: 400 },
    );
  }
  try {
    await runManager.approveRun(id, choice, body.all);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "approval failed" },
      { status: 502 },
    );
  }
}
