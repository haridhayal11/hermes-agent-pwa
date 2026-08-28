import { runManager, type RunEventRow } from "@/lib/run-manager";
import { error, versioned, withDevice } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

interface StreamCursor {
  runId: string;
  sequence: number;
}

function parseCursor(value: string | null): StreamCursor | null {
  if (!value) return null;
  const separator = value.lastIndexOf(":");
  if (separator <= 0) return null;
  const runId = value.slice(0, separator);
  const sequence = Number(value.slice(separator + 1));
  if (!runId || !Number.isSafeInteger(sequence) || sequence < -1) return null;
  return { runId, sequence };
}

function resolveRunId(
  projectId: string,
  explicit: string | null,
  sessionId?: string,
): string | null {
  if (explicit) {
    const run = runManager.getRun(explicit);
    return run?.project_id === projectId && (!sessionId || run.session_id === sessionId)
      ? explicit
      : null;
  }
  return (
    runManager.getActiveRun(projectId, sessionId)?.run_id ??
    runManager.getLatestRun(projectId, sessionId)?.run_id ??
    null
  );
}

function cursorFor(row: RunEventRow): string {
  return `${row.runId}:${row.seq}`;
}

function eventData(row: RunEventRow, runActive: boolean) {
  const type = row.event.event;
  const payload = Object.fromEntries(
    Object.entries(row.event).filter(([key]) => key !== "event" && key !== "run_id"),
  );
  return {
    type: typeof type === "string" ? type : "unknown",
    runId: row.runId,
    runActive,
    sequence: row.seq,
    occurredAt: row.ts,
    payload,
  };
}

function enqueueRunEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  row: RunEventRow,
  runActive: boolean,
) {
  const data = eventData(row, runActive);
  controller.enqueue(
    encoder.encode(
      `id: ${cursorFor(row)}\nevent: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`,
    ),
  );
}

function subscribeProject(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  projectId: string,
  sessionId?: string,
): () => void {
  return runManager.subscribeProject(projectId, (raw) => {
    try {
      const { event: rawType, ...payload } = raw;
      const type = typeof rawType === "string" ? rawType : "project.event";
      controller.enqueue(
        encoder.encode(
          `event: ${type}\ndata: ${JSON.stringify({
            type,
            runId: null,
            sequence: null,
            occurredAt: Date.now(),
            payload,
          })}\n\n`,
        ),
      );
    } catch {
      // The client closed between the event being emitted and enqueued.
    }
  }, sessionId);
}

function streamHeaders() {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/v1/projects/[id]/events">,
) {
  const { id } = await ctx.params;
  const sessionId = new URL(request.url).searchParams.get("sessionId") ?? undefined;
  return streamVersionedEvents(request, id, sessionId);
}

async function streamVersionedEvents(
  request: Request,
  projectId: string,
  sessionId?: string,
) {
  return withDevice(request, async () => {
    if (!runManager.getProject(projectId)) {
      return error(404, "not_found", "Project not found.");
    }

    const url = new URL(request.url);
    const cursor = parseCursor(
      url.searchParams.get("cursor") ?? request.headers.get("last-event-id"),
    );
    const explicitRunId = url.searchParams.get("runId");
    const runId = resolveRunId(projectId, explicitRunId, sessionId);
    if (explicitRunId && !runId) {
      return error(404, "not_found", "Run not found in this project.");
    }
    const afterSequence = cursor?.runId === runId ? cursor.sequence : -1;
    const encoder = new TextEncoder();
    let unsubscribeRun: (() => void) | null = null;
    let cleanup: (() => void) | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            clearInterval(keepalive);
          }
        }, 25_000);
        const unsubscribeProject = subscribeProject(
          controller,
          encoder,
          projectId,
          sessionId,
        );

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

        if (!runId) {
          request.signal.addEventListener("abort", close, { once: true });
          return;
        }

        const run = runManager.getRun(runId);
        const runActive = Boolean(
          run && !["completed", "failed", "cancelled"].includes(run.status),
        );
        const send = (row: RunEventRow) => {
          try {
            enqueueRunEvent(controller, encoder, row, runActive);
          } catch {
            // already closed
          }
        };
        unsubscribeRun = runManager.subscribe(runId, afterSequence, send);

        if (!runActive) {
          close();
          return;
        }

        const onRunClosed = () => close();
        runManager.once(`${runId}:closed`, onRunClosed);
        request.signal.addEventListener(
          "abort",
          () => {
            runManager.off(`${runId}:closed`, onRunClosed);
            unsubscribeRun?.();
            close();
          },
          { once: true },
        );
      },
      cancel() {
        cleanup?.();
      },
    });

    return versioned(new Response(stream, { headers: streamHeaders() }));
  });
}
