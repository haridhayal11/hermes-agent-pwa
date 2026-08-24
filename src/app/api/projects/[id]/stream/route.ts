import { runManager, type RunEventRow } from "@/lib/run-manager";

export const dynamic = "force-dynamic";

// seq is per-run, not per-project, so a stream connection is scoped to one
// run at a time. When that run finishes, we close and the client's
// useRunStream hook reconnects (without run_id) to pick up whatever's next —
// e.g. a queued message that just auto-started.
function resolveRunId(projectId: string, explicitRunId: string | null): string | null {
  if (explicitRunId) return explicitRunId;
  const active = runManager.getActiveRun(projectId);
  if (active) return active.run_id;
  const latest = runManager.getLatestRun(projectId);
  return latest ? latest.run_id : null;
}

export async function GET(
  req: Request,
  ctx: RouteContext<"/api/projects/[id]/stream">,
) {
  const { id } = await ctx.params;
  if (!runManager.getProject(id)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const afterSeq = Number(url.searchParams.get("after_seq") ?? "-1");
  const runId = resolveRunId(id, url.searchParams.get("run_id"));

  if (!runId) {
    // No run has ever happened for this project yet — keep the connection
    // open with keepalives so the client doesn't spin on reconnect errors.
    // The project channel still runs over it: a cron job can deliver into a
    // thread that has never had a run of its own.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const timer = setInterval(() => {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 25_000);
        const unsubscribeProject = subscribeProject(controller, encoder, id);
        req.signal.addEventListener("abort", () => {
          clearInterval(timer);
          unsubscribeProject();
          controller.close();
        });
      },
    });
    return new Response(stream, { headers: sseHeaders() });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (row: RunEventRow) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ run_id: row.runId, seq: row.seq, ts: row.ts, ...row.event })}\n\n`),
          );
        } catch {
          // controller already closed
        }
      };

      unsubscribe = runManager.subscribe(runId, afterSeq, send);
      // Project-wide events ride the same connection. They carry no seq —
      // there is no replay log behind them, because the durable copy is a
      // cron_deliveries row the history route merges in — so the client's
      // after_seq bookkeeping is untouched by them.
      const unsubscribeProject = subscribeProject(controller, encoder, id);

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 25_000);

      const onClosed = () => {
        clearInterval(keepalive);
        unsubscribeProject();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // The run may have already finished before this request connected —
      // its ":closed" event fired in the past and won't fire again, so the
      // backlog replay above is all this connection will ever see. Close now
      // instead of hanging until the keepalive timeout.
      const run = runManager.getRun(runId);
      const isActive = run ? !["completed", "failed", "cancelled"].includes(run.status) : false;
      if (!isActive) {
        unsubscribe?.();
        onClosed();
        return;
      }

      runManager.once(`${runId}:closed`, onClosed);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        runManager.off(`${runId}:closed`, onClosed);
        unsubscribeProject();
        unsubscribe?.();
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

/**
 * Forwards the project channel onto an open SSE connection.
 *
 * Used by both branches below, because a cron delivery has to reach a thread
 * whether or not a run happens to be in flight — and the no-run branch is the
 * common case for a job that fires overnight.
 */
function subscribeProject(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  projectId: string,
): () => void {
  return runManager.subscribeProject(projectId, (event) => {
    try {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ ts: Date.now(), ...event })}\n\n`),
      );
    } catch {
      // controller already closed
    }
  });
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}
