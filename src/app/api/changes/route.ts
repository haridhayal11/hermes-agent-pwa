import { changesAfter, subscribeChanges, type ApiChangeEvent } from "@/lib/api-changes";

export const dynamic = "force-dynamic";

function frame(event: ApiChangeEvent) {
  return `id: ${event.sequence}\nevent: change\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("cursor");
  const parsed = Number(raw ?? "0");
  const requested = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  // Browser subscribers need changes from now onward. Native clients carry a
  // durable cursor and use the authenticated replay endpoint instead.
  const cursor =
    raw === null
      ? (changesAfter(0).events.at(-1)?.sequence ?? 0)
      : requested;
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const backlog = changesAfter(cursor);
      if (backlog.reset) {
        controller.enqueue(
          encoder.encode(
            `event: change\ndata: ${JSON.stringify({
              type: "sync.reset",
              sequence: null,
              occurredAt: Date.now(),
              payload: {},
            })}\n\n`,
          ),
        );
      } else {
        for (const event of backlog.events) controller.enqueue(encoder.encode(frame(event)));
      }
      unsubscribe = subscribeChanges((event) => {
        try {
          controller.enqueue(encoder.encode(frame(event)));
        } catch {
          // already closed
        }
      });
      timer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          if (timer) clearInterval(timer);
        }
      }, 25_000);
      request.signal.addEventListener(
        "abort",
        () => {
          if (timer) clearInterval(timer);
          unsubscribe?.();
          try {
            controller.close();
          } catch {
            // already closed
          }
        },
        { once: true },
      );
    },
    cancel() {
      if (timer) clearInterval(timer);
      unsubscribe?.();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
