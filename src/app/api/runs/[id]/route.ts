import { runManager } from "@/lib/run-manager";
import { pendingApproval, pendingClarify } from "@/lib/run-text";

/** One run as this app holds it, and what it is blocked on, if anything.
 *  Ours rather than a proxy of `GET /v1/runs/{id}`: Hermes forgets a
 *  terminal run after an hour, and our row is what every client renders. */
export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  const run = runManager.getRun(id);
  if (!run) return Response.json({ error: "run not found" }, { status: 404 });

  const waiting = run.status === "waiting_for_approval";
  const approval = waiting ? pendingApproval(id) : null;
  const question = waiting ? pendingClarify(id) : null;
  return Response.json({
    run_id: run.run_id,
    project_id: run.project_id,
    session_id: run.session_id,
    status: run.status,
    started_at: run.started_at,
    ended_at: run.ended_at,
    pending_approval: approval
      ? { command: approval.command, choices: approval.choices }
      : null,
    pending_question: question
      ? { question: question.question, choices: question.choices, multi_select: question.multiSelect }
      : null,
  });
}
