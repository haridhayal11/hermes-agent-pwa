import { db } from "./db";
import { parseAttachments } from "./project-send";
import { createRootSession, sessionDto } from "./project-sessions";
import { runManager } from "./run-manager";

interface DeliveryRow {
  id: string;
}

/** Starts an ordinary root conversation from one report in the protected
 * Scheduled inbox. The report stays in the inbox; cron_discussions makes it
 * the first visible and model-visible item in the new session. */
export async function createScheduledDiscussion(
  request: Request,
  projectId: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { deliveryId?: unknown; text?: unknown; attachments?: unknown }
    | null;
  const deliveryId = typeof body?.deliveryId === "string" ? body.deliveryId : "";
  const text = typeof body?.text === "string" ? body.text : "";
  const attachments = parseAttachments(body?.attachments);
  if (!deliveryId) {
    return Response.json({ error: "deliveryId is required" }, { status: 400 });
  }
  if (!text.trim() && attachments.length === 0) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  const delivery = db
    .prepare(
      `SELECT d.id FROM cron_deliveries d
        JOIN project_sessions ps ON ps.session_id = d.session_id
       WHERE d.id = ? AND d.project_id = ? AND ps.kind = 'scheduled'`,
    )
    .get(deliveryId, projectId) as DeliveryRow | undefined;
  if (!delivery) {
    return Response.json({ error: "scheduled report not found" }, { status: 404 });
  }

  const session = await createRootSession(projectId);
  if (!session) return Response.json({ error: "not found" }, { status: 404 });
  db.prepare(
    `INSERT INTO cron_discussions (session_id, delivery_id, created_at)
     VALUES (?, ?, ?)`,
  ).run(session.session_id, delivery.id, Date.now());

  try {
    const result = await runManager.sendMessage(
      projectId,
      text,
      attachments,
      { sessionId: session.session_id },
    );
    return Response.json(
      { session: sessionDto(session), sessionId: session.session_id, ...result },
      { status: 202 },
    );
  } catch (error) {
    const startupError = error instanceof Error ? error.message : "send failed";
    return Response.json(
      {
        session: sessionDto(session),
        sessionId: session.session_id,
        queued: false,
        mode: "failed",
        runId: "",
        startupError,
      },
      // The durable discussion was created successfully. Treat that as the
      // accepted operation so native clients can open it and retry there.
      { status: 202 },
    );
  }
}
