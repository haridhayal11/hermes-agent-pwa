import { GET as streamEvents } from "@/app/api/v1/projects/[id]/events/route";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(request: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  const url = new URL(request.url);
  url.searchParams.set("sessionId", sessionId);
  return streamEvents(new Request(url, request), {
    params: Promise.resolve({ id }),
  } as RouteContext<"/api/v1/projects/[id]/events">);
}
