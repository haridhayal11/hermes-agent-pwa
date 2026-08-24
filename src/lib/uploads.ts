import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_SLUG } from "./branding";
import { dataDir, db } from "./db";

/* Hermes takes text and images and nothing else: api_server.py's content
 * normaliser accepts `http(s)` and `data:image/...` URLs and answers
 * 400 unsupported_content_type for uploaded files and documents. There is no
 * upload endpoint and no download endpoint on :8642 either.
 *
 * The turbopackIgnore comments below are load-bearing: every path here is
 * genuinely runtime data (a home directory, a project's cwd), and without
 * them Turbopack traces the entire project into the server bundle "just in
 * case", which on this deploy means shipping the source tree and public/.
 *
 * So attachments split two ways. An image becomes a data: URL and travels
 * inline in the run's input. Anything else is written to disk on this machine
 * — which the agent shares — and only its absolute path goes in the prompt,
 * for the agent to open with its own file tools.
 *
 * The return direction works the same way in reverse. The agent answers with
 * absolute paths to things it made ("Latest PDF: /home/user/…/main.pdf"), and
 * /api/files serves those back — but only from roots named here. A project's
 * own directory is one. The other is its outbox, which exists because most
 * projects have no directory at all: without it there is nowhere the agent can
 * put a file that the phone is allowed to fetch. */

/** Above this an inline data: URL is a liability, not a convenience. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_FILE_BYTES = 64 * 1024 * 1024;

export function uploadCacheRoot(): string {
  return path.join(os.homedir(), ".hermes", "cache", "pwa-uploads");
}

/** Where the agent puts files meant for the user. Named in the run's
 *  instructions, so it only works because the agent is told about it. */
export function outboxRoot(): string {
  return path.join(dataDir(), "outbox");
}

export function outboxDirFor(projectId: string): string {
  return path.join(outboxRoot(), projectId);
}

/** Where a project's non-image attachments land: its own directory if it has
 *  one, otherwise a per-project folder under the shared cache. */
export function uploadDirFor(projectId: string): string {
  const row = db.prepare(`SELECT cwd FROM projects WHERE id = ?`).get(projectId) as
    | { cwd: string | null }
    | undefined;
  const cwd = row?.cwd?.trim();
  if (cwd && path.isAbsolute(cwd) && fs.existsSync(/*turbopackIgnore: true*/ cwd)) {
    return path.join(cwd, `${APP_SLUG}-uploads`);
  }
  return path.join(uploadCacheRoot(), projectId);
}

/**
 * Strips directory components and anything that would confuse a shell.
 * Spaces go too: these paths are quoted into prompts and typed into terminal
 * commands by the agent, and the thread's own path scraper stops at the first
 * space when it reads them back out of a reply.
 */
export function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return base.length > 0 ? base.slice(0, 120) : "attachment";
}

/**
 * Path allowlist for downloads. A file is readable only if it sits under the
 * upload cache, under the outbox, or under some project's own working
 * directory — never anywhere else on the host, and never above a root via
 * `..` (resolve() flattens it, and the separator suffix stops `/srv/codex`
 * matching `/srv/code`).
 *
 * This is the whole security model for /api/files. The box also holds
 * ~/.ssh, ~/.hermes/.env and the Hermes API key, and the agent's own output
 * is what proposes the paths — so the roots stay explicit and narrow rather
 * than "anything readable".
 */
export function isReadablePath(candidate: string): boolean {
  const target = path.resolve(candidate);

  const roots = [uploadCacheRoot(), outboxRoot()];
  const rows = db
    .prepare(`SELECT cwd FROM projects WHERE cwd IS NOT NULL AND cwd != ''`)
    .all() as { cwd: string }[];
  for (const row of rows) {
    if (path.isAbsolute(row.cwd)) roots.push(row.cwd);
  }

  return roots.some((root) => {
    const resolved = path.resolve(root);
    return target === resolved || target.startsWith(`${resolved}${path.sep}`);
  });
}

/** Extension → MIME, for the handful worth previewing or labelling. */
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".zip": "application/zip",
};

export function mimeFor(filename: string): string {
  return MIME[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

/** Writes a buffer into the project's upload directory without clobbering. */
export function writeUpload(
  projectId: string,
  filename: string,
  data: Buffer,
): string {
  const dir = uploadDirFor(projectId);
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });

  const safe = safeFilename(filename);
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length) || "attachment";

  let target = path.join(dir, safe);
  let n = 1;
  while (fs.existsSync(/*turbopackIgnore: true*/ target)) {
    target = path.join(dir, `${stem}-${n}${ext}`);
    n += 1;
  }

  fs.writeFileSync(/*turbopackIgnore: true*/ target, data);
  return target;
}
