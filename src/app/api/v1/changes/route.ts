import {
  changesAfter,
  subscribeChanges,
  type ApiChangeEvent,
} from "@/lib/api-changes";
import { versioned, withDevice } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

function frame(event: ApiChangeEvent) {
  return `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request) {
  return withDevice(request, async () => {
    const url = new URL(request.url);
    const raw = url.searchParams.get("cursor") ?? request.headers.get("last-event-id") ?? "0";
    const parsed = Number(raw);
    const cursor = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    let keepalive: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let replaying = true;
        const queued: ApiChangeEvent[] = [];
        const send = (event: ApiChangeEvent) => {
          if (replaying) {
            queued.push(event);
            return;
          }
          try {
            controller.enqueue(encoder.encode(frame(event)));
          } catch {
            // Connection closed between emission and delivery.
          }
        };
        unsubscribe = subscribeChanges(send);

        const backlog = changesAfter(cursor);
        if (backlog.reset) {
          controller.enqueue(
            encoder.encode(
              `event: sync.reset\ndata: ${JSON.stringify({
                type: "sync.reset",
                sequence: null,
                occurredAt: Date.now(),
                payload: {},
              })}\n\n`,
            ),
          );
        } else {
          for (const event of backlog.events) {
            controller.enqueue(encoder.encode(frame(event)));
          }
        }
        const lastReplayed = backlog.events.at(-1)?.sequence ?? cursor;
        replaying = false;
        for (const event of queued) {
          if (event.sequence > lastReplayed) controller.enqueue(encoder.encode(frame(event)));
        }

        keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            if (keepalive) clearInterval(keepalive);
          }
        }, 25_000);

        request.signal.addEventListener(
          "abort",
          () => {
            if (keepalive) clearInterval(keepalive);
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
        if (keepalive) clearInterval(keepalive);
        unsubscribe?.();
      },
    });

    return versioned(
      new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      }),
    );
  });
}
