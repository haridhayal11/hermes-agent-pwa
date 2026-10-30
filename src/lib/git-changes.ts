import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/* "What changed": the project's working tree against its last commit, read
 * by this app on the host — Hermes has no endpoint for it (`/diff` is a CLI
 * command), and asking the agent would spend a turn on a read.
 *
 * Read-only, and careful about it:
 *
 *  - `execFile`, never a shell. The cwd is user text; it is never spliced
 *    into a command line, only checked (absolute, real, a directory) and
 *    handed to the child as its working directory.
 *  - The repository is agent-writable, so its config is agent-writable. The
 *    routes by which a plain status or diff runs a program are switched off
 *    per call: fsmonitor (runs on every status), hooks, external diff and
 *    textconv. Filter drivers can't be disabled wholesale from the command
 *    line; that is not a new exposure, because this app runs as the same
 *    user the agent already executes commands as.
 *  - `GIT_OPTIONAL_LOCKS=0`: a status may otherwise refresh the index and
 *    take its lock, which would make the agent's own `git commit` fail.
 *  - Bounded: a timeout, an output cap, and a patch budget past which files
 *    are listed without their hunks. */

const HARDENING = [
  "-c", "core.fsmonitor=false",
  "-c", "core.hooksPath=/dev/null",
  "-c", "diff.external=",
  "-c", "diff.relative=false",
  "-c", "core.quotePath=false",
  "-c", "color.ui=false",
];
const DIFF_FLAGS = ["--no-color", "--no-ext-diff", "--no-textconv"];
/** git's well-known empty tree: the base for a repository with no commits */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const TIMEOUT_MS = 5_000;
const MAX_BUFFER = 2 * 1024 * 1024;
const PATCH_BUDGET = 512 * 1024;
const MAX_FILES = 500;

export type ChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface ChangedFile {
  path: string;
  /** the name before a rename */
  oldPath?: string;
  status: ChangeStatus;
  /** null for binary files and untracked ones */
  additions: number | null;
  deletions: number | null;
  binary: boolean;
  /** unified diff for this file; null when untracked, binary or over budget */
  patch: string | null;
}

export type GitChanges =
  | { repo: false; reason: string }
  | {
      repo: true;
      root: string;
      branch: string | null;
      files: ChangedFile[];
      additions: number;
      deletions: number;
      /** some hunks (or files) were left out to stay inside the budget */
      truncated: boolean;
    };

class GitError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    readonly code: string | number | null,
  ) {
    super(message);
  }
}

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      [...HARDENING, ...args],
      {
        cwd,
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_OPTIONAL_LOCKS: "0",
          GIT_TERMINAL_PROMPT: "0",
          GIT_PAGER: "cat",
          LC_ALL: "C",
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code ?? null;
          reject(new GitError(error.message, String(stderr ?? ""), code));
        } else {
          resolve(String(stdout));
        }
      },
    );
  });
}

/** A failure in words the panel can show, rather than a 500. */
function explain(error: unknown): string {
  if (!(error instanceof GitError)) return "Couldn't read this repository";
  if (error.code === "ENOENT") return "git isn't installed on this machine";
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return "The changes are too large to show";
  if ((error as { killed?: boolean }).killed || /timed out|SIGTERM/i.test(error.message)) {
    return "git took too long to answer";
  }
  if (/dubious ownership/i.test(error.stderr)) {
    return "git refuses this repository: it's owned by another user (safe.directory)";
  }
  if (/not a git repository/i.test(error.stderr)) return "Not a git repository";
  const line = error.stderr.trim().split("\n").at(-1);
  return line ? line.replace(/^fatal:\s*/, "") : "Couldn't read this repository";
}

/** The project's cwd, if it is a real directory; never trusted beyond that. */
export function resolveWorkingDirectory(cwd: string | null | undefined): string | null {
  const raw = cwd?.trim();
  if (!raw || !path.isAbsolute(raw)) return null;
  try {
    const real = fs.realpathSync(/*turbopackIgnore: true*/ raw);
    return fs.statSync(/*turbopackIgnore: true*/ real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

/* ---- parsing (pure) ------------------------------------------------------ */

interface StatusEntry {
  x: string;
  y: string;
  oldPath?: string;
}

/** `git status --porcelain=v1 -z`: "XY path\0", renames add "\0old". */
export function parseStatus(raw: string): Map<string, StatusEntry> {
  const out = new Map<string, StatusEntry>();
  const parts = raw.split("\0");
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    const x = entry[0];
    const y = entry[1];
    const file = entry.slice(3);
    const record: StatusEntry = { x, y };
    if (x === "R" || x === "C" || y === "R" || y === "C") {
      record.oldPath = parts[i + 1];
      i += 1;
    }
    out.set(file, record);
  }
  return out;
}

interface Numstat {
  additions: number | null;
  deletions: number | null;
  binary: boolean;
  oldPath?: string;
}

/** `git diff --numstat -z`: "a\td\tpath\0", or "a\td\t\0old\0new\0" for a rename. */
export function parseNumstat(raw: string): Map<string, Numstat> {
  const out = new Map<string, Numstat>();
  const parts = raw.split("\0");
  for (let i = 0; i < parts.length; i += 1) {
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(parts[i]);
    if (!match) continue;
    const binary = match[1] === "-";
    let file = match[3];
    let oldPath: string | undefined;
    if (file === "") {
      oldPath = parts[i + 1];
      file = parts[i + 2];
      i += 2;
    }
    if (!file) continue;
    out.set(file, {
      additions: binary ? null : Number(match[1]),
      deletions: binary ? null : Number(match[2]),
      binary,
      oldPath,
    });
  }
  return out;
}

function unquote(name: string): string {
  return name.startsWith('"') && name.endsWith('"')
    ? name.slice(1, -1).replace(/\\(["\\])/g, "$1")
    : name;
}

/** Splits a whole-repo unified diff into one patch per file, keyed by its path. */
export function splitPatch(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  const chunks = raw.split(/^(?=diff --git )/m).filter((chunk) => chunk.startsWith("diff --git "));
  for (const chunk of chunks) {
    const renamed = /^rename to (.+)$/m.exec(chunk)?.[1];
    const plus = /^\+\+\+ b\/(.+)$/m.exec(chunk)?.[1];
    const minus = /^--- a\/(.+)$/m.exec(chunk)?.[1];
    const header = /^diff --git "?a\/.+?"? "?b\/(.+?)"?$/m.exec(chunk)?.[1];
    const name = unquote(renamed ?? plus ?? minus ?? header ?? "");
    if (name) out.set(name, chunk.trimEnd());
  }
  return out;
}

function statusOf(entry: StatusEntry | undefined, numstat: Numstat | undefined): ChangeStatus {
  if (!entry) return numstat?.oldPath ? "renamed" : "modified";
  const { x, y } = entry;
  if (x === "?" && y === "?") return "untracked";
  if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
    return "conflicted";
  }
  if (x === "R" || y === "R") return "renamed";
  if (x === "A" || (x === " " && y === "A")) return "added";
  if (x === "D" || y === "D") return "deleted";
  return "modified";
}

export function buildChanges(
  statusRaw: string,
  numstatRaw: string,
  patchRaw: string | null,
): { files: ChangedFile[]; truncated: boolean } {
  const status = parseStatus(statusRaw);
  const numstat = parseNumstat(numstatRaw);
  const patches = patchRaw === null ? new Map<string, string>() : splitPatch(patchRaw);
  let truncated = patchRaw === null;
  let budget = PATCH_BUDGET;

  const names = new Set([...numstat.keys(), ...status.keys()]);
  const files: ChangedFile[] = [];
  for (const name of [...names].sort()) {
    const entry = status.get(name);
    const counts = numstat.get(name);
    const kind = statusOf(entry, counts);
    let patch = kind === "untracked" ? null : (patches.get(name) ?? null);
    if (patch !== null) {
      if (patch.length > budget) {
        patch = null;
        truncated = true;
      } else {
        budget -= patch.length;
      }
    }
    files.push({
      path: name,
      ...((entry?.oldPath ?? counts?.oldPath) ? { oldPath: entry?.oldPath ?? counts?.oldPath } : {}),
      status: kind,
      additions: kind === "untracked" ? null : (counts?.additions ?? null),
      deletions: kind === "untracked" ? null : (counts?.deletions ?? null),
      binary: counts?.binary ?? false,
      patch,
    });
  }
  if (files.length > MAX_FILES) truncated = true;
  return { files: files.slice(0, MAX_FILES), truncated };
}

/* ---- the read ------------------------------------------------------------ */

export async function readGitChanges(cwd: string | null | undefined): Promise<GitChanges> {
  const dir = resolveWorkingDirectory(cwd);
  if (!dir) return { repo: false, reason: "The working directory doesn't exist on this machine" };

  let root: string;
  try {
    root = (await git(dir, ["rev-parse", "--show-toplevel"])).trim();
  } catch (error) {
    return { repo: false, reason: explain(error) };
  }

  try {
    const [branchRaw, hasHead] = await Promise.all([
      git(root, ["branch", "--show-current"]).catch(() => ""),
      git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).then(
        () => true,
        () => false,
      ),
    ]);
    const base = hasHead ? "HEAD" : EMPTY_TREE;
    const [statusRaw, numstatRaw] = await Promise.all([
      git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
      git(root, ["diff", base, "--numstat", "-z", "-M", ...DIFF_FLAGS]),
    ]);
    // The hunks are the one part allowed to fail on size: the list still
    // says what changed, and the panel says the rest was left out.
    const patchRaw = await git(root, ["diff", base, "-M", ...DIFF_FLAGS]).catch((error) => {
      if (error instanceof GitError && error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
        return null;
      }
      throw error;
    });

    const { files, truncated } = buildChanges(statusRaw, numstatRaw, patchRaw);
    return {
      repo: true,
      root,
      branch: branchRaw.trim() || null,
      files,
      additions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
      deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
      truncated,
    };
  } catch (error) {
    return { repo: false, reason: explain(error) };
  }
}
