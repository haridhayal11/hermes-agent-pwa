import { db } from "./db";
import { hermes } from "./hermes";
import { deliveriesFor } from "./cron-watcher";
import { mergeProjectMessages } from "./message-normalization";

export async function messagesForSession(projectId: string, sessionId: string) {
  const session = db
    .prepare(
      `SELECT session_id FROM project_sessions WHERE project_id = ? AND session_id = ?`,
    )
    .get(projectId, sessionId);
  if (!session) return null;
  const response = await hermes.getMessages(sessionId);
  return mergeProjectMessages(response.data, deliveriesFor(projectId, sessionId));
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
