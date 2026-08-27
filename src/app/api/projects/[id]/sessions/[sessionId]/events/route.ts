import { streamProjectRun } from "@/lib/project-stream";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  return streamProjectRun(request, id, sessionId);
}
