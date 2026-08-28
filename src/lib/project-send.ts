import type { Attachment } from "./chat-types";
import { runManager } from "./run-manager";

export function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): Attachment[] => {
    if (!item || typeof item !== "object") return [];
    const attachment = item as Record<string, unknown>;
    const name = typeof attachment.name === "string" ? attachment.name : "attachment";
    const size =
      typeof attachment.size === "number" &&
      Number.isFinite(attachment.size) &&
      attachment.size >= 0
        ? attachment.size
        : undefined;
    if (
      attachment.kind === "image" &&
      typeof attachment.url === "string" &&
      attachment.url.startsWith("data:image/")
    ) {
      const image: Attachment = { kind: "image", name, url: attachment.url, size };
      if (typeof attachment.path === "string" && attachment.path.startsWith("/")) {
        image.path = attachment.path;
      }
      return [image];
    }
    if (
      attachment.kind === "file" &&
      typeof attachment.path === "string" &&
      attachment.path.startsWith("/")
    ) {
      return [{ kind: "file", name, path: attachment.path, size }];
    }
    return [];
  });
}

export async function sendProjectMessage(
  request: Request,
  projectId: string,
  sessionId?: string,
) {
  const body = await request.json();
  const text: string = body.text;
  const attachments = parseAttachments(body.attachments);
  if ((!text || typeof text !== "string") && attachments.length === 0) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }
  if (!runManager.getProject(projectId)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const prefer =
    body.prefer === "steer" || body.prefer === "queue" ? body.prefer : undefined;
  try {
    const result = await runManager.sendMessage(projectId, text ?? "", attachments, {
      prefer,
      sessionId,
    });
    return Response.json(
      { ...result, sessionId: sessionId ?? runManager.getProject(projectId)?.session_id },
      { status: 202 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "send failed";
    return Response.json(
      { error: message },
      { status: /Unknown session/.test(message) ? 404 : 502 },
    );
  }
}
