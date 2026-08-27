import { db } from "./db";
import { hermes, type HermesMessage } from "./hermes";
import { deliveriesFor, type CronDelivery } from "./cron-watcher";

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

export async function messagesForSession(projectId: string, sessionId: string) {
  const session = db
    .prepare(
      `SELECT session_id FROM project_sessions WHERE project_id = ? AND session_id = ?`,
    )
    .get(projectId, sessionId);
  if (!session) return null;
  const response = await hermes.getMessages(sessionId);
  return merge(response.data, deliveriesFor(projectId, sessionId));
}

export async function messagePageResponse(
  request: Request,
  projectId: string,
  sessionId: string,
) {
  const messages = await messagesForSession(projectId, sessionId);
  if (!messages) return Response.json({ error: "not found" }, { status: 404 });
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? messages.length);
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.min(500, Math.max(1, requestedLimit))
    : Math.min(500, Math.max(1, messages.length));
  const requestedEnd = Number(url.searchParams.get("cursor") ?? messages.length);
  const end = Number.isSafeInteger(requestedEnd)
    ? Math.min(messages.length, Math.max(0, requestedEnd))
    : messages.length;
  const start = Math.max(0, end - limit);
  return Response.json({
    messages: messages.slice(start, end),
    nextCursor: start > 0 ? String(start) : null,
    hasMore: start > 0,
  });
}
