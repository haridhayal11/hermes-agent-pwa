import { db } from "@/lib/db";
import { hermes, type HermesMessage } from "@/lib/hermes";
import { deliveriesFor, type CronDelivery } from "@/lib/cron-watcher";

/**
 * The thread's history.
 *
 * Almost all of it is Hermes' — the session transcript is the source of truth
 * and this app deliberately keeps no copy. The exception is a scheduled job's
 * result: Hermes ran it in the cron agent's own session, so it is not in this
 * conversation at all, and the only durable record is our cron_deliveries
 * row. Merging here is what makes a delivery survive a reload instead of
 * living until the tab is closed.
 */

/** Milliseconds, or null when Hermes didn't say. */
function messageTime(message: HermesMessage): number | null {
  const raw = message.timestamp;
  if (typeof raw === "number") return raw < 1e12 ? raw * 1000 : raw;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function asMessage(delivery: CronDelivery) {
  return {
    id: delivery.id,
    role: "cron" as const,
    content: delivery.body,
    cron: {
      jobId: delivery.job_id,
      jobName: delivery.job_name,
      status: delivery.status,
      ts: delivery.ts,
    },
  };
}

/**
 * Interleaves deliveries into the transcript by time.
 *
 * Hermes does not promise a timestamp on every message, so this carries the
 * last one it saw forward: a delivery lands before the first message that is
 * demonstrably newer than it, and anything left over goes at the end. That
 * degrades to "append" on a transcript with no timestamps at all, which is
 * the right answer — better late in the thread than silently dropped.
 */
function merge(messages: HermesMessage[], deliveries: CronDelivery[]) {
  if (deliveries.length === 0) return messages as unknown[];

  const out: unknown[] = [];
  let next = 0;
  for (const message of messages) {
    const at = messageTime(message);
    if (at !== null) {
      while (next < deliveries.length && deliveries[next].ts <= at) {
        out.push(asMessage(deliveries[next]));
        next += 1;
      }
    }
    out.push(message);
  }
  for (; next < deliveries.length; next += 1) out.push(asMessage(deliveries[next]));
  return out;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/messages">) {
  const { id } = await ctx.params;
  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | { session_id: string }
    | undefined;
  if (!project) return Response.json({ error: "not found" }, { status: 404 });

  const res = await hermes.getMessages(project.session_id);
  return Response.json({
    messages: merge(res.data, deliveriesFor(id, project.session_id)),
  });
}
