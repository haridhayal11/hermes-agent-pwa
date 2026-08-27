import {
  GET as listProjects,
  POST as createProject,
} from "@/app/api/projects/route";
import { error, withDevice } from "@/lib/api/v1/http";
import {
  legacyProjectWriteRequest,
  projectResponse,
} from "@/lib/api/v1/projects";
import { idempotentJson } from "@/lib/api/v1/idempotency";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withDevice(request, async () => {
    const url = new URL(request.url);
    if (url.searchParams.get("archived") === "true") {
      url.searchParams.set("archived", "1");
    }
    return projectResponse(await listProjects(new Request(url, request)));
  });
}

export async function POST(request: Request) {
  return withDevice(request, async (device) => {
    const translated = await legacyProjectWriteRequest(request.clone()).catch(
      () => null,
    );
    if (!translated) {
      return error(400, "invalid_request", "A JSON request body is required.");
    }
    return idempotentJson(request, device.id, "POST:/api/v1/projects", async () =>
      projectResponse(await createProject(translated)),
    );
  });
}
