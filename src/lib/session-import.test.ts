import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-session-import-"));
process.env.DB_PATH = path.join(directory, "state.db");

const { client } = vi.hoisted(() => ({
  client: {
    deleteSession: vi.fn<(id: string) => Promise<object>>(async () => ({})),
    patchSession: vi.fn<(id: string, body: object) => Promise<object>>(async () => ({})),
  },
}));
vi.mock("./api-changes", () => ({ publishChange: vi.fn(), publishActivity: vi.fn() }));
vi.mock("./bots", () => ({
  botName: vi.fn(() => null),
  hermesForProject: vi.fn(() => client),
}));
vi.mock("./project-session", () => ({
  createProjectSession: vi.fn(),
  renameProjectSession: vi.fn(async (id: string, title: string) =>
    client.patchSession(id, { title }),
  ),
}));

let db: typeof import("./db").db;
let sessions: typeof import("./project-sessions");

beforeAll(async () => {
  db = (await import("./db")).db;
  sessions = await import("./project-sessions");
});

afterAll(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec(`DELETE FROM project_sessions; DELETE FROM projects; DELETE FROM app_settings;`);
  for (const [id, name] of [["p", "Project"], ["q", "Other"]]) {
    db.prepare(
      `INSERT INTO projects (id, name, session_id, created_at, last_active_at)
       VALUES (?, ?, ?, 1, 1)`,
    ).run(id, name, `${id}-chat`);
    db.prepare(
      `INSERT INTO project_sessions (session_id, project_id, title, created_at, last_active_at)
       VALUES (?, ?, 'Chat', 1, 1)`,
    ).run(`${id}-chat`, id);
  }
  client.deleteSession.mockClear();
  client.patchSession.mockClear();
});

describe("adoptSession", () => {
  it("attaches the same session id, with Hermes' own title and times", () => {
    const result = sessions.adoptSession("p", {
      id: "cli-1",
      title: "Refactor notes",
      started_at: 1_700_000_000, // seconds, as some builds send it
      last_active: "2026-10-29T10:00:00Z",
    });
    expect(result).toMatchObject({
      kind: "adopted",
      session: {
        session_id: "cli-1",
        title: "Refactor notes",
        imported: 1,
        created_at: 1_700_000_000_000,
        last_active_at: Date.parse("2026-10-29T10:00:00Z"),
      },
    });
    expect(
      db.prepare(`SELECT last_chat_session_id FROM projects WHERE id = 'p'`).get(),
    ).toEqual({ last_chat_session_id: "cli-1" });
  });

  it("refuses a session that is already some project's chat, and General", () => {
    expect(sessions.adoptSession("p", { id: "q-chat" })).toEqual({
      kind: "attached",
      projectId: "q",
      projectName: "Other",
    });
    db.prepare(`INSERT INTO app_settings (key, value) VALUES ('general_project_id', 'q')`).run();
    expect(sessions.adoptSession("q", { id: "new" })).toEqual({ kind: "general" });
  });

  it("never deletes or renames an imported chat in Hermes", async () => {
    sessions.adoptSession("p", { id: "cli-2", title: "From the CLI" });
    await sessions.renameSession("p", "cli-2", "Renamed here");
    expect(client.patchSession).not.toHaveBeenCalled();
    expect(sessions.getProjectSession("p", "cli-2")?.title).toBe("Renamed here");

    expect(await sessions.deleteSessionSubtree("p", "cli-2")).toMatchObject({ kind: "deleted" });
    expect(client.deleteSession).not.toHaveBeenCalled();
    expect(sessions.getProjectSession("p", "cli-2")).toBeUndefined();
  });
});
