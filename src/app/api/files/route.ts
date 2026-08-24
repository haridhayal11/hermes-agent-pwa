import fs from "node:fs";
import path from "node:path";
import { isReadablePath, mimeFor } from "@/lib/uploads";

/* Files in both directions.
 *
 * GET  — serve one file back to the phone.
 * POST — probe a batch of candidate paths. The thread scrapes absolute paths
 *        out of the agent's reply and needs to know which of them are real and
 *        allowed *before* it offers a download; probing one path per request
 *        would mean a request per path per message.
 *
 * The allowlist in isReadablePath() is the security model for both. The agent
 * proposes these paths, and it can write anywhere the gateway user can, so
 * "the path came from the model" is not evidence that it should be served. */

interface Probe {
  path: string;
  exists: boolean;
  /** false when the path is outside every allowed root */
  allowed: boolean;
  name: string;
  size: number;
  mime: string;
}

function probe(candidate: string): Probe {
  const resolved = path.resolve(candidate);
  const base = {
    path: resolved,
    name: path.basename(resolved),
    mime: mimeFor(resolved),
    size: 0,
  };
  if (!isReadablePath(resolved)) {
    return { ...base, exists: false, allowed: false };
  }
  try {
    const stat = fs.statSync(/*turbopackIgnore: true*/ resolved);
    if (!stat.isFile()) return { ...base, exists: false, allowed: true };
    return { ...base, exists: true, allowed: true, size: stat.size };
  } catch {
    return { ...base, exists: false, allowed: true };
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { paths?: unknown } | null;
  const paths = Array.isArray(body?.paths) ? body.paths : [];
  // Bounded: one message could otherwise name a thousand paths and each probe
  // is a synchronous stat.
  const candidates = paths
    .filter((p): p is string => typeof p === "string" && p.startsWith("/"))
    .slice(0, 24);

  return Response.json({ files: candidates.map(probe) });
}

/**
 * GET /api/files?path=/abs/path
 *
 * Serves a file the agent produced or the user uploaded, restricted to the
 * upload cache, the per-project outbox, and directories a project names.
 */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("path");
  if (!target) {
    return Response.json({ error: "path is required" }, { status: 400 });
  }
  if (!isReadablePath(target)) {
    return Response.json({ error: "path is not allowed" }, { status: 403 });
  }

  const resolved = path.resolve(target);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(/*turbopackIgnore: true*/ resolved);
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  if (!stat.isFile()) {
    return Response.json({ error: "not a file" }, { status: 400 });
  }

  const mime = mimeFor(resolved);
  // Images and PDFs are worth viewing in place on a phone; everything else
  // downloads. SVG is deliberately excluded from that — it is a script
  // container, and this content is not ours.
  const inlineable =
    (mime.startsWith("image/") && mime !== "image/svg+xml") ||
    mime === "application/pdf";

  const data = fs.readFileSync(/*turbopackIgnore: true*/ resolved);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": inlineable ? mime : "application/octet-stream",
      "Content-Length": String(stat.size),
      "Content-Disposition": `${inlineable ? "inline" : "attachment"}; filename="${path.basename(resolved)}"`,
      // Belt and braces: this body is agent-authored and must never be
      // interpreted as markup by a sniffing browser.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
