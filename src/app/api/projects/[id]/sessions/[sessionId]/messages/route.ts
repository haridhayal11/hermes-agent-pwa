import { messagePageResponse } from "@/lib/project-messages";
import { sendProjectMessage } from "@/lib/project-send";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  return messagePageResponse(request, id, sessionId);
}

export async function POST(request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  return sendProjectMessage(request, id, sessionId);
}
