import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildChanges, parseNumstat, parseStatus, readGitChanges, splitPatch } from "./git-changes";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-git-changes-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

function repo(name: string) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  const run = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: dir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@example.com",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@example.com",
      },
    });
  run("init", "-q", "-b", "main");
  return { dir, run };
}

describe("parsers", () => {
  it("reads porcelain status with renames", () => {
    const status = parseStatus("M  a.ts\0R  new.ts\0old.ts\0?? scratch.txt\0");
    expect([...status]).toEqual([
      ["a.ts", { x: "M", y: " " }],
      ["new.ts", { x: "R", y: " ", oldPath: "old.ts" }],
      ["scratch.txt", { x: "?", y: "?" }],
    ]);
  });

  it("reads numstat, binary files and renames", () => {
    const numstat = parseNumstat("3\t1\ta.ts\0-\t-\tlogo.png\0" + "0\t0\t\0old.ts\0new.ts\0");
    expect(numstat.get("a.ts")).toEqual({ additions: 3, deletions: 1, binary: false, oldPath: undefined });
    expect(numstat.get("logo.png")).toMatchObject({ binary: true, additions: null });
    expect(numstat.get("new.ts")).toMatchObject({ oldPath: "old.ts" });
  });

  it("splits a diff per file and spends the patch budget in path order", () => {
    const patch = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-x\n+y\n";
    expect([...splitPatch(patch).keys()]).toEqual(["a.ts"]);
    const huge = `diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n${"+z\n".repeat(300_000)}`;
    const { files, truncated } = buildChanges("", "1\t1\ta.ts\0" + "300000\t0\tb.ts\0", patch + huge);
    expect(files.map((f) => [f.path, f.patch !== null])).toEqual([
      ["a.ts", true],
      ["b.ts", false],
    ]);
    expect(truncated).toBe(true);
  });
});

describe("readGitChanges", () => {
  it("reports staged, unstaged, untracked and renamed work against HEAD", async () => {
    const { dir, run } = repo("work");
    fs.writeFileSync(path.join(dir, "keep.txt"), "one\ntwo\n");
    fs.writeFileSync(path.join(dir, "move-me.txt"), "same\nsame\nsame\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");

    fs.writeFileSync(path.join(dir, "keep.txt"), "one\nTWO\nthree\n"); // unstaged edit
    fs.writeFileSync(path.join(dir, "staged.txt"), "new\n");
    run("add", "staged.txt"); // staged add
    run("mv", "move-me.txt", "moved.txt"); // rename
    fs.writeFileSync(path.join(dir, "scratch.log"), "untracked\n");

    const result = await readGitChanges(dir);
    expect(result).toMatchObject({ repo: true, branch: "main", truncated: false });
    if (!result.repo) return;
    expect(result.files.map((f) => [f.path, f.status, f.additions, f.deletions])).toEqual([
      ["keep.txt", "modified", 2, 1],
      ["moved.txt", "renamed", 0, 0],
      ["scratch.log", "untracked", null, null],
      ["staged.txt", "added", 1, 0],
    ]);
    expect(result.files[0].patch).toContain("+TWO");
    expect(result.files[1].oldPath).toBe("move-me.txt");
  });

  it("works before the first commit", async () => {
    const { dir, run } = repo("fresh");
    fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
    run("add", "a.txt");
    const result = await readGitChanges(dir);
    expect(result).toMatchObject({ repo: true, files: [{ path: "a.txt", status: "added", additions: 1 }] });
  });

  it("says why, instead of failing, outside a repository or without a directory", async () => {
    const plain = path.join(scratch, "plain");
    fs.mkdirSync(plain);
    // GIT_CEILING_DIRECTORIES keeps git from finding a repo above tmp
    process.env.GIT_CEILING_DIRECTORIES = scratch;
    try {
      expect(await readGitChanges(plain)).toEqual({ repo: false, reason: "Not a git repository" });
    } finally {
      delete process.env.GIT_CEILING_DIRECTORIES;
    }
    expect(await readGitChanges("relative/path")).toMatchObject({ repo: false });
    expect(await readGitChanges(path.join(scratch, "missing"))).toMatchObject({ repo: false });
  });
});
