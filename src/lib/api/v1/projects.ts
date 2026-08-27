import { fromLegacy, json } from "./http";

interface StoredProject {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  cwd: string | null;
  instructions: string | null;
  pinned: number;
  skills: string | null;
  model: string | null;
  provider: string | null;
  model_options: string | null;
  session_id: string;
  created_at: number;
  last_active_at: number;
  archived: number;
}

function parseObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseStrings(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function projectDto(project: StoredProject) {
  return {
    id: project.id,
    name: project.name,
    emoji: project.emoji,
    color: project.color,
    workingDirectory: project.cwd,
    instructions: project.instructions,
    pinned: project.pinned === 1,
    skills: parseStrings(project.skills),
    modelSelection: project.model
      ? {
          model: project.model,
          provider: project.provider,
          options: parseObject(project.model_options),
        }
      : null,
    activeSessionId: project.session_id,
    // Retained for clients generated from the initial v1 contract.
    sessionId: project.session_id,
    createdAt: project.created_at,
    lastActiveAt: project.last_active_at,
    archived: project.archived === 1,
  };
}

export async function projectResponse(response: Response): Promise<Response> {
  if (!response.ok) return fromLegacy(response);
  const body = (await response.json()) as {
    project?: StoredProject;
    projects?: StoredProject[];
    [key: string]: unknown;
  };
  return json(
    {
      ...body,
      ...(body.project ? { project: projectDto(body.project) } : {}),
      ...(body.projects ? { projects: body.projects.map(projectDto) } : {}),
    },
    { status: response.status },
  );
}

/** Translates the stable public names to today's SQLite-backed route shape. */
export async function legacyProjectWriteRequest(request: Request): Promise<Request> {
  const body = (await request.json()) as Record<string, unknown>;
  const selection =
    body.modelSelection &&
    typeof body.modelSelection === "object" &&
    !Array.isArray(body.modelSelection)
      ? (body.modelSelection as Record<string, unknown>)
      : null;
  const translated: Record<string, unknown> = { ...body };
  if (Object.hasOwn(body, "workingDirectory")) {
    translated.cwd = body.workingDirectory;
  }
  if (Object.hasOwn(body, "modelSelection")) {
    translated.model = typeof selection?.model === "string" ? selection.model : null;
    translated.provider =
      typeof selection?.provider === "string" ? selection.provider : null;
    translated.model_options = selection?.options ?? null;
  }
  delete translated.workingDirectory;
  delete translated.modelSelection;

  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(translated),
    signal: request.signal,
  });
}
