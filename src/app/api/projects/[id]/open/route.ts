import {
  projectEntrySession,
  selectProjectSession,
  sessionDto,
} from "@/lib/project-sessions";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Context) {
  const { id } = await ctx.params;
  const entry = projectEntrySession(id);
  if (!entry) return Response.json({ error: "not found" }, { status: 404 });
  selectProjectSession(id, entry.session_id);
  return Response.json({ session: sessionDto(entry), sessionId: entry.session_id });
}
