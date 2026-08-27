import { runManager } from "@/lib/run-manager";
import type { Attachment } from "@/lib/chat-types";

/** Trusts nothing from the body: a bad shape here becomes a malformed run. */
function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): Attachment[] => {
    if (!item || typeof item !== "object") return [];
    const a = item as Record<string, unknown>;
    const name = typeof a.name === "string" ? a.name : "attachment";
    const size =
      typeof a.size === "number" && Number.isFinite(a.size) && a.size >= 0
        ? a.size
        : undefined;
    if (a.kind === "image" && typeof a.url === "string" && a.url.startsWith("data:image/")) {
      const image: Attachment = { kind: "image", name, url: a.url, size };
      if (typeof a.path === "string" && a.path.startsWith("/")) image.path = a.path;
      return [image];
    }
    if (a.kind === "file" && typeof a.path === "string" && a.path.startsWith("/")) {
      return [{ kind: "file", name, path: a.path, size }];
    }
    return [];
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/send">) {
  const { id } = await ctx.params;
  const body = await req.json();
  const text: string = body.text;
  const attachments = parseAttachments(body.attachments);
  // An attachment on its own is a valid message — "what is this?" is implied.
  if ((!text || typeof text !== "string") && attachments.length === 0) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  if (!runManager.getProject(id)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  // `/steer` and `/queue` in the composer force the branch that sendMessage
  // would otherwise pick for itself. Anything else is ignored.
  const prefer =
    body.prefer === "steer" || body.prefer === "queue" ? body.prefer : undefined;

  try {
    const result = await runManager.sendMessage(id, text ?? "", attachments, { prefer });
    return Response.json(result, { status: 202 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "send failed" },
      { status: 502 },
    );
  }
}
