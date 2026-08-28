import { createScheduledDiscussion } from "@/lib/scheduled-replies";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Context) {
  const { id } = await ctx.params;
  return createScheduledDiscussion(request, id);
}
