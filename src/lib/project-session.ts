import { hermes, HermesApiError } from "./hermes";

/* Hermes session titles are globally unique (SessionDB enforces it), but a
 * project name in this app is just a label the user picked. Those two things
 * collide constantly in practice: deleting a project keeps its Hermes session
 * by default, so the old session still owns the title and creating a new
 * project with the same name would fail.
 *
 * The local name stays exactly what the user typed; only the Hermes-side title
 * gets disambiguated. */

function isTitleTaken(err: unknown): boolean {
  if (!(err instanceof HermesApiError)) return false;
  if (err.status !== 400) return false;
  const code = (err.body as { error?: { code?: string } })?.error?.code;
  return code === "invalid_title";
}

/** "General" -> "General", "General (2)", "General (3)", … */
function* titleCandidates(base: string): Generator<string> {
  yield base;
  for (let n = 2; n <= 20; n++) yield `${base} (${n})`;
}

/**
 * Creates the Hermes session for a project, retrying with a suffixed title
 * when the name is already taken. Returns the title actually used.
 */
export async function createProjectSession(
  sessionId: string,
  name: string,
): Promise<string> {
  let lastErr: unknown;
  for (const title of titleCandidates(name)) {
    try {
      await hermes.createSession({ id: sessionId, title });
      return title;
    } catch (err) {
      if (!isTitleTaken(err)) throw err;
      lastErr = err;
    }
  }
  // 20 collisions means something is wrong beyond a stale duplicate.
  throw lastErr;
}

/** Same disambiguation for renames. Returns the title actually applied. */
export async function renameProjectSession(
  sessionId: string,
  name: string,
): Promise<string> {
  let lastErr: unknown;
  for (const title of titleCandidates(name)) {
    try {
      await hermes.patchSession(sessionId, { title });
      return title;
    } catch (err) {
      if (!isTitleTaken(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Maps a Hermes failure onto a response the UI can actually show. */
export function hermesErrorResponse(err: unknown): Response {
  if (err instanceof HermesApiError) {
    const message =
      (err.body as { error?: { message?: string } })?.error?.message ??
      "Hermes rejected the request";
    // 4xx is a bad request we forwarded; anything else is upstream being unwell.
    const status = err.status >= 400 && err.status < 500 ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
  return Response.json(
    { error: "Could not reach Hermes. Is the gateway running on :8642?" },
    { status: 502 },
  );
}
