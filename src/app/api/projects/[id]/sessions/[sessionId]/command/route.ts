import { db } from "@/lib/db";
import {
  execSlashCommand,
  GatewayCommandError,
  GatewayUnavailableError,
} from "@/lib/hermes-gateway";
import { getProjectSession } from "@/lib/project-sessions";

type Context = { params: Promise<{ id: string; sessionId: string }> };

/* One Hermes slash command, run by the gateway against this chat's session
 * (lib/hermes-gateway.ts). Answers the command's output, or — for the
 * commands that rewrite themselves into a prompt (/plan, /learn, /init, …) —
 * the prompt, which the client then sends as an ordinary turn so it queues,
 * streams and notifies like any other. */
export async function POST(request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  const session = getProjectSession(id, sessionId);
  if (!session) return Response.json({ error: "not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { command?: unknown } | null;
  const command = typeof body?.command === "string" ? body.command.trim() : "";
  if (!/^\/[a-z][a-z0-9_-]*(\s[\s\S]*)?$/i.test(command) || command.length > 4000) {
    return Response.json({ error: "command must be a slash command, e.g. /usage" }, { status: 400 });
  }

  const project = db.prepare(`SELECT profile FROM projects WHERE id = ?`).get(id) as
    | { profile: string | null }
    | undefined;
  try {
    const result = await execSlashCommand(project?.profile ?? null, sessionId, command);
    return Response.json(result);
  } catch (err) {
    if (err instanceof GatewayCommandError) {
      // The gateway's refusal, verbatim: it knows why better than we do, and
      // `detail` often says what to use instead.
      return Response.json(
        { error: err.detail ? `${err.message} — ${err.detail}` : err.message, reason: err.reason },
        { status: 409 },
      );
    }
    if (err instanceof GatewayUnavailableError) {
      return Response.json({ error: err.message, reason: err.reason }, { status: 503 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "command failed" },
      { status: 502 },
    );
  }
}
