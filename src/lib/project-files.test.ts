import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-project-files-"));
process.env.DB_PATH = path.join(directory, "state.db");

let listProjectFiles: typeof import("./project-files").listProjectFiles;
let db: typeof import("./db").db;

beforeAll(async () => {
  db = (await import("./db")).db;
  ({ listProjectFiles } = await import("./project-files"));
});

afterAll(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function write(file: string, body: string, mtime: number) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  fs.utimesSync(file, mtime, mtime);
}

describe("listProjectFiles", () => {
  it("lists the outbox and the cwd uploads, newest first, and skips links and dotfiles", () => {
    const outbox = path.join(directory, "outbox", "p1");
    const cwd = path.join(directory, "repo");
    write(path.join(outbox, "report.pdf"), "pdf", 1_000);
    write(path.join(outbox, "charts", "week.png"), "png", 3_000);
    write(path.join(outbox, ".DS_Store"), "x", 4_000);
    write(path.join(cwd, "hermes-pwa-uploads", "notes.txt"), "hi", 2_000);
    write(path.join(cwd, "src", "index.ts"), "not listed", 5_000);
    fs.symlinkSync("/etc/passwd", path.join(outbox, "passwd"));

    const files = listProjectFiles("p1", cwd);
    expect(files.map((f) => [f.relative, f.source, f.mime])).toEqual([
      ["charts/week.png", "outbox", "image/png"],
      ["notes.txt", "uploads", "text/plain"],
      ["report.pdf", "outbox", "application/pdf"],
    ]);
  });

  it("is empty, not an error, when nothing has been written yet", () => {
    expect(listProjectFiles("nobody", null)).toEqual([]);
  });
});
