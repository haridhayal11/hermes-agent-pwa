import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-scheduled-migration-"));
const databasePath = path.join(directory, "old.db");
process.env.DB_PATH = databasePath;

let migrated: typeof import("./db").db;

beforeAll(async () => {
  const old = new Database(databasePath);
  old.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT,
      color TEXT,
      cwd TEXT,
      session_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE project_sessions (
      session_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      parent_session_id TEXT REFERENCES project_sessions(session_id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE cron_deliveries (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      job_name TEXT NOT NULL,
      status TEXT NOT NULL,
      body TEXT NOT NULL,
      source_path TEXT,
      ts INTEGER NOT NULL
    );
    INSERT INTO projects
      (id, name, session_id, created_at, last_active_at, archived)
      VALUES ('project', 'Project', 'chat', 10, 20, 0);
    INSERT INTO project_sessions
      (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived)
      VALUES ('chat', 'project', 'Chat', NULL, 10, 20, 0);
    INSERT INTO cron_deliveries
      (id, job_id, project_id, session_id, job_name, status, body, source_path, ts)
      VALUES ('old-report', 'job', 'project', 'chat', 'Daily', 'ok', 'done', '/old.md', 15);
  `);
  old.close();

  vi.resetModules();
  migrated = (await import("./db")).db;
});

afterAll(() => {
  migrated.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("Scheduled inbox migration", () => {
  it("keeps old reports in place, marks them read, and backfills the last chat", () => {
    expect(
      migrated.prepare(
        `SELECT session_id, read_at FROM cron_deliveries WHERE id = 'old-report'`,
      ).get(),
    ).toEqual({ session_id: "chat", read_at: 15 });
    expect(
      migrated.prepare(
        `SELECT last_chat_session_id FROM projects WHERE id = 'project'`,
      ).get(),
    ).toEqual({ last_chat_session_id: "chat" });
    expect(
      migrated.prepare(
        `SELECT kind FROM project_sessions WHERE session_id = 'chat'`,
      ).get(),
    ).toEqual({ kind: "chat" });
    expect(
      migrated.prepare(
        `SELECT COUNT(*) AS count FROM project_sessions WHERE kind = 'scheduled'`,
      ).get(),
    ).toEqual({ count: 0 });
  });

  it("enforces one valid Scheduled session per project", () => {
    migrated.prepare(
      `INSERT INTO project_sessions
        (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived, kind)
       VALUES ('scheduled', 'project', 'Scheduled', NULL, 30, 30, 0, 'scheduled')`,
    ).run();
    expect(() =>
      migrated.prepare(
        `INSERT INTO project_sessions
          (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived, kind)
         VALUES ('scheduled-2', 'project', 'Scheduled', NULL, 31, 31, 0, 'scheduled')`,
      ).run(),
    ).toThrow();
    expect(() =>
      migrated.prepare(
        `INSERT INTO project_sessions
          (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived, kind)
         VALUES ('invalid', 'project', 'Invalid', NULL, 32, 32, 0, 'other')`,
      ).run(),
    ).toThrow(/invalid project session kind|CHECK constraint/);
  });

  it("deleting a discussion removes only its link, not the original report", () => {
    migrated.prepare(
      `INSERT OR IGNORE INTO project_sessions
        (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived, kind)
       VALUES ('scheduled', 'project', 'Scheduled', NULL, 30, 30, 0, 'scheduled')`,
    ).run();
    migrated.prepare(
      `INSERT INTO project_sessions
        (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived, kind)
       VALUES ('discussion', 'project', 'Report reply', NULL, 40, 40, 0, 'chat')`,
    ).run();
    migrated.prepare(
      `INSERT INTO cron_deliveries
        (id, job_id, project_id, session_id, job_name, status, body, source_path, ts, read_at)
       VALUES ('new-report', 'job', 'project', 'scheduled', 'Daily', 'ok', 'new', '/new.md', 35, 35)`,
    ).run();
    migrated.prepare(
      `INSERT INTO cron_discussions (session_id, delivery_id, created_at)
       VALUES ('discussion', 'new-report', 40)`,
    ).run();

    migrated.prepare(`DELETE FROM project_sessions WHERE session_id = 'discussion'`).run();

    expect(
      migrated.prepare(`SELECT id FROM cron_deliveries WHERE id = 'new-report'`).get(),
    ).toEqual({ id: "new-report" });
    expect(
      migrated.prepare(
        `SELECT COUNT(*) AS count FROM cron_discussions WHERE delivery_id = 'new-report'`,
      ).get(),
    ).toEqual({ count: 0 });
  });
});
