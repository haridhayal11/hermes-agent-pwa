import fs from "node:fs";
import path from "node:path";
import { APP_SLUG } from "./branding";
import { mimeFor, outboxDirFor, uploadCacheRoot } from "./uploads";

/* What a project's Files panel lists: the outbox the agent is told to write
 * into, and wherever this project's uploads have landed. Not the whole
 * working directory — that is a repository, and a repository is what the
 * "What changed" panel is for.
 *
 * Every root here is inside /api/files' allowlist, so anything listed can be
 * opened. Symlinks are skipped rather than followed: the allowlist compares
 * paths, not real paths, and a link inside the outbox could point anywhere. */

export type FileSource = "outbox" | "uploads";

export interface ProjectFile {
  path: string;
  name: string;
  /** relative to its root, for files in subfolders */
  relative: string;
  size: number;
  mime: string;
  modifiedAt: number;
  source: FileSource;
}

const MAX_DEPTH = 3;
const MAX_FILES = 300;
/* A runaway folder must not turn a panel into a disk scan. */
const MAX_VISITED = 5_000;

export function projectFileRoots(
  projectId: string,
  cwd: string | null,
): { root: string; source: FileSource }[] {
  const roots: { root: string; source: FileSource }[] = [
    { root: outboxDirFor(projectId), source: "outbox" },
    // Both, because which one an upload used depended on the cwd at the time.
    { root: path.join(uploadCacheRoot(), projectId), source: "uploads" },
  ];
  const dir = cwd?.trim();
  if (dir && path.isAbsolute(dir)) {
    roots.push({ root: path.join(dir, `${APP_SLUG}-uploads`), source: "uploads" });
  }
  return roots;
}

export function listProjectFiles(projectId: string, cwd: string | null): ProjectFile[] {
  const found: ProjectFile[] = [];
  let visited = 0;

  const walk = (root: string, dir: string, depth: number, source: FileSource) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true });
    } catch {
      return; // missing or unreadable: nothing to list
    }
    for (const entry of entries) {
      if (++visited > MAX_VISITED) return;
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) walk(root, full, depth + 1, source);
        continue;
      }
      if (!entry.isFile()) continue;
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(/*turbopackIgnore: true*/ full);
      } catch {
        continue;
      }
      found.push({
        path: full,
        name: entry.name,
        relative: path.relative(root, full),
        size: stat.size,
        mime: mimeFor(entry.name),
        modifiedAt: stat.mtimeMs,
        source,
      });
    }
  };

  const seen = new Set<string>();
  for (const { root, source } of projectFileRoots(projectId, cwd)) {
    const resolved = path.resolve(root);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    walk(resolved, resolved, 1, source);
  }
  return found.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, MAX_FILES);
}
