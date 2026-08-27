import { runManager, type RunEventRow } from "./run-manager";

function resolveRunId(
  projectId: string,
  explicitRunId: string | null,
  sessionId?: string,
): string | null {
  if (explicitRunId) return explicitRunId;
  return (
    runManager.getActiveRun(projectId, sessionId)?.run_id ??
    runManager.getLatestRun(projectId, sessionId)?.run_id ??
    null
  );
}

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
      // already closed
    }
  });
}

const HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export async function streamProjectRun(
  request: Request,
  projectId: string,
  sessionId?: string,
) {
  if (!runManager.getProject(projectId)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const url = new URL(request.url);
  const afterSeq = Number(url.searchParams.get("after_seq") ?? "-1");
  const explicitRunId = url.searchParams.get("run_id");
  if (explicitRunId) {
    const explicit = runManager.getRun(explicitRunId);
    if (
      !explicit ||
      explicit.project_id !== projectId ||
      (sessionId && explicit.session_id !== sessionId)
    ) {
      return Response.json({ error: "run not found" }, { status: 404 });
    }
  }
  const runId = resolveRunId(projectId, explicitRunId, sessionId);
  const encoder = new TextEncoder();

  if (!runId) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const keepalive = setInterval(() => {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 25_000);
        const unsubscribeProject = subscribeProject(controller, encoder, projectId);
        request.signal.addEventListener(
          "abort",
          () => {
            clearInterval(keepalive);
            unsubscribeProject();
            try {
              controller.close();
            } catch {
              // already closed
            }
          },
          { once: true },
        );
      },
    });
    return new Response(stream, { headers: HEADERS });
  }

  let unsubscribeRun: (() => void) | null = null;
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (row: RunEventRow) => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                run_id: row.runId,
                seq: row.seq,
                ts: row.ts,
                ...row.event,
              })}\n\n`,
            ),
          );
        } catch {
          // already closed
        }
      };
      unsubscribeRun = runManager.subscribe(runId, afterSeq, send);
      const unsubscribeProject = subscribeProject(controller, encoder, projectId);
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 25_000);
      const close = () => {
        clearInterval(keepalive);
        unsubscribeProject();
        unsubscribeRun?.();
        unsubscribeRun = null;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      cleanup = close;

      const run = runManager.getRun(runId);
      if (!run || ["completed", "failed", "cancelled"].includes(run.status)) {
        close();
        return;
      }
      const onClosed = () => close();
      runManager.once(`${runId}:closed`, onClosed);
      request.signal.addEventListener(
        "abort",
        () => {
          runManager.off(`${runId}:closed`, onClosed);
          close();
        },
        { once: true },
      );
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, { headers: HEADERS });
}
