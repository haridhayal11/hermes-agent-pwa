import { sendProjectMessage } from "@/lib/project-send";

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/send">) {
  const { id } = await ctx.params;
  return sendProjectMessage(request, id);
}
