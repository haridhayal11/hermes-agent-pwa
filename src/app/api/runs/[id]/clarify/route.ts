import { HermesApiError } from "@/lib/hermes";
import { PromptNotPendingError, runManager } from "@/lib/run-manager";

/** Answers the question a run's clarify tool is blocked on. */
export async function POST(req: Request, ctx: RouteContext<"/api/runs/[id]/clarify">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { answer?: unknown } | null;
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
  if (!answer) {
    return Response.json({ error: "answer must be a non-empty string" }, { status: 400 });
  }
  try {
    await runManager.answerClarify(id, answer);
    return Response.json({ ok: true });
  } catch (err) {
    // Answered on another device, or the run moved on: nothing is waiting.
    if (err instanceof PromptNotPendingError) {
      return Response.json({ error: "this run is not waiting on a question" }, { status: 409 });
    }
    if (err instanceof HermesApiError && err.status === 409) {
      return Response.json({ error: "the question was already answered" }, { status: 409 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "answer failed" },
      { status: 502 },
    );
  }
}
