import { getAgentName } from "@/lib/app-settings";
import { botName } from "@/lib/bots";
import { db } from "@/lib/db";
import { messagesForSession } from "@/lib/project-messages";
import { toThreadMessages, type RawThreadMessage } from "@/lib/thread-messages";
import {
  exportFilename,
  parseExportFormat,
  transcriptJson,
  transcriptMarkdown,
} from "@/lib/transcript-export";

type Context = { params: Promise<{ id: string; sessionId: string }> };

/* The whole transcript as a file. Server-side because the browser's copy of
 * the thread is capped at the newest 500 rows after a refresh, and an export
 * that silently drops the start of a conversation is worse than none. */
export async function GET(request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  const format = parseExportFormat(new URL(request.url).searchParams.get("format"));
  if (!format) {
    return Response.json({ error: "format must be md or json" }, { status: 400 });
  }
  const row = db
    .prepare(
      `SELECT p.name AS project_name, p.profile, s.title
         FROM project_sessions s JOIN projects p ON p.id = s.project_id
        WHERE s.project_id = ? AND s.session_id = ?`,
    )
    .get(id, sessionId) as { project_name: string; profile: string | null; title: string } | undefined;
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  let raw: RawThreadMessage[];
  try {
    raw = ((await messagesForSession(id, sessionId)) ?? []) as RawThreadMessage[];
  } catch {
    return Response.json({ error: "Hermes did not return the transcript" }, { status: 502 });
  }

  const meta = {
    projectName: row.project_name,
    sessionTitle: row.title,
    agentName: botName(row.profile) ?? getAgentName(),
    sessionId,
    exportedAt: Date.now(),
  };
  const body =
    format === "json"
      ? transcriptJson(meta, raw)
      : transcriptMarkdown(meta, toThreadMessages(raw));
  const filename = exportFilename(meta, format);
  return new Response(body, {
    headers: {
      "Content-Type":
        format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
