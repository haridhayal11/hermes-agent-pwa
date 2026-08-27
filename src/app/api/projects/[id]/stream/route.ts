import { streamProjectRun } from "@/lib/project-stream";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/projects/[id]/stream">,
) {
  const { id } = await ctx.params;
  return streamProjectRun(request, id);
}
