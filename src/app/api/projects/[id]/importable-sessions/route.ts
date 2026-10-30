import { BOT_CHAT_TITLE, hermesForProject } from "@/lib/bots";
import { db } from "@/lib/db";
import { HermesApiError } from "@/lib/hermes";
import { epochMs } from "@/lib/project-sessions";

type Context = { params: Promise<{ id: string }> };

const PAGE = 50;

/* Hermes sessions this project could bring in: ones started in the CLI,
 * Telegram or anywhere else, under the project's own profile — a session
 * lives in one profile's database, and the project can only reach that one.
 *
 * Leaves out what is already a chat somewhere in this app (a session belongs
 * to one project), every Bot Chat (that is a Bot's, and binds through New
 * project), and child sessions — forks and compaction links are reached
 * through their root, which Hermes resolves. */
export async function GET(request: Request, ctx: Context) {
  const { id } = await ctx.params;
  if (!db.prepare(`SELECT id FROM projects WHERE id = ?`).get(id)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const offsetRaw = Number(new URL(request.url).searchParams.get("offset") ?? 0);
  const offset = Number.isSafeInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  let page;
  try {
    page = await hermesForProject(id).listSessions({
      limit: PAGE,
      offset,
      includeChildren: false,
    });
  } catch (error) {
    const status = error instanceof HermesApiError ? error.status : 0;
    return Response.json(
      {
        error:
          status === 404
            ? "This Hermes doesn't list its sessions"
            : "Hermes didn't answer with its sessions",
      },
      { status: 502 },
    );
  }

  const attached = new Set(
    (db.prepare(`SELECT session_id FROM project_sessions`).all() as { session_id: string }[]).map(
      (row) => row.session_id,
    ),
  );
  const sessions = page.data
    .filter((session) => !attached.has(session.id) && session.title !== BOT_CHAT_TITLE)
    .filter((session) => !session.parent_session_id)
    .map((session) => ({
      id: session.id,
      title: session.title?.trim() || null,
      source: session.source ?? null,
      preview: typeof session.preview === "string" ? session.preview.slice(0, 200) : null,
      messageCount: typeof session.message_count === "number" ? session.message_count : null,
      lastActive:
        epochMs(session.last_active) ?? epochMs(session.ended_at) ?? epochMs(session.started_at),
    }));
  return Response.json({
    sessions,
    nextOffset: page.has_more ? offset + page.data.length : null,
  });
}
