import {
  DELETE as deleteProject,
  GET as getProject,
  PATCH as updateProject,
} from "@/app/api/projects/[id]/route";
import { error, fromLegacy, withDevice } from "@/lib/api/v1/http";
import {
  legacyProjectWriteRequest,
  projectResponse,
} from "@/lib/api/v1/projects";

type Context = RouteContext<"/api/v1/projects/[id]">;
type LegacyContext = RouteContext<"/api/projects/[id]">;

function legacyContext(ctx: Context): LegacyContext {
  return ctx as unknown as LegacyContext;
}

export async function GET(request: Request, ctx: Context) {
  return withDevice(request, async () =>
    projectResponse(await getProject(request, legacyContext(ctx))),
  );
}

export async function PATCH(request: Request, ctx: Context) {
  return withDevice(request, async () => {
    const translated = await legacyProjectWriteRequest(request).catch(() => null);
    if (!translated) {
      return error(400, "invalid_request", "A JSON request body is required.");
    }
    return projectResponse(await updateProject(translated, legacyContext(ctx)));
  });
}

export async function DELETE(request: Request, ctx: Context) {
  return withDevice(request, async () => {
    const url = new URL(request.url);
    for (const key of ["purge", "session"]) {
      if (url.searchParams.get(key) === "true") url.searchParams.set(key, "1");
    }
    return fromLegacy(
      await deleteProject(new Request(url, request), legacyContext(ctx)),
    );
  });
}
