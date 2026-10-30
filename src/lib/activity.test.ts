import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-activity-"));
process.env.DB_PATH = path.join(directory, "state.db");

const { publishActivity } = vi.hoisted(() => ({ publishActivity: vi.fn() }));
vi.mock("./api-changes", () => ({ publishActivity, publishChange: vi.fn() }));

let db: typeof import("./db").db;
let activity: typeof import("./activity");

beforeAll(async () => {
  db = (await import("./db")).db;
  activity = await import("./activity");
});

afterAll(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function project(id: string, archived = 0) {
  db.prepare(
    `INSERT INTO projects (id, name, session_id, created_at, last_active_at, archived)
     VALUES (?, ?, ?, 1, 1, ?)`,
  ).run(id, `Project ${id}`, `${id}-chat`, archived);
  chat(id, `${id}-chat`);
}

function chat(projectId: string, sessionId: string) {
  db.prepare(
    `INSERT INTO project_sessions (session_id, project_id, title, created_at, last_active_at)
     VALUES (?, ?, ?, 1, 1)`,
  ).run(sessionId, projectId, `Chat ${sessionId}`);
}

function run(
  runId: string,
  sessionId: string,
  status: string,
  { ended = null as number | null, seen = null as number | null, prompt = "do it" } = {},
) {
  const projectId = sessionId.replace(/-chat.*$/, "");
  db.prepare(
    `INSERT INTO runs (run_id, project_id, session_id, status, started_at, ended_at, prompt_preview, seen_at)
     VALUES (?, ?, ?, ?, 100, ?, ?, ?)`,
  ).run(runId, projectId, sessionId, status, ended, prompt, seen);
}

function event(runId: string, seq: number, body: Record<string, unknown>) {
  db.prepare(`INSERT INTO run_events (run_id, seq, event_json, ts) VALUES (?, ?, ?, 1)`).run(
    runId,
    seq,
    JSON.stringify(body),
  );
}

beforeEach(() => {
  db.exec(`DELETE FROM run_events; DELETE FROM runs; DELETE FROM project_sessions;
           DELETE FROM projects; DELETE FROM app_settings;`);
  publishActivity.mockClear();
});

describe("activity", () => {
  it("reports one state per chat, most pressing first", () => {
    project("a");
    project("b");
    project("c");
    run("a-old", "a-chat", "completed", { ended: 150 });
    run("a-live", "a-chat", "waiting_for_approval");
    event("a-live", 0, { event: "approval.request", command: "rm -rf build" });
    run("b-live", "b-chat", "running");
    run("c-done", "c-chat", "completed", { ended: 200 });
    event("c-done", 0, { event: "message.delta", delta: "All **done** here." });

    const { items, badge } = activity.getActivity();
    expect(items.map((item) => [item.sessionId, item.state, item.detail])).toEqual([
      ["a-chat", "approval", "rm -rf build"],
      ["b-chat", "running", "do it"],
      ["c-chat", "unseen", "All done here."],
    ]);
    // the approval and the unseen reply wait on the reader; a busy chat doesn't
    expect(badge).toBe(2);
  });

  it("leaves out seen, cancelled, archived and answered work", () => {
    project("a");
    project("z", 1);
    run("seen", "a-chat", "completed", { ended: 150, seen: 160 });
    run("stopped", "a-chat", "cancelled", { ended: 170 });
    run("hidden", "z-chat", "completed", { ended: 180 });
    expect(activity.getActivity()).toMatchObject({ items: [], badge: 0 });
  });

  it("drops the command once the approval has been answered", () => {
    project("a");
    run("live", "a-chat", "running");
    event("live", 0, { event: "approval.request", command: "deploy" });
    event("live", 1, { event: "approval.responded", choice: "once" });
    expect(activity.getActivity().items[0]).toMatchObject({ state: "running" });
  });

  it("counts General's unread reports in the badge", () => {
    project("g");
    db.prepare(`INSERT INTO app_settings (key, value) VALUES ('general_project_id', 'g')`).run();
    db.prepare(
      `INSERT INTO cron_deliveries (id, job_id, project_id, session_id, job_name, status, body, ts)
       VALUES ('d1', 'job', 'g', 'g-chat', 'Daily', 'ok', 'hi', 5)`,
    ).run();
    expect(activity.getActivity()).toMatchObject({
      scheduled: { projectId: "g", sessionId: "g-chat", unread: 1 },
      badge: 1,
    });
    db.exec(`DELETE FROM cron_deliveries`);
  });

  it("marks a chat seen, including the run it watched end before the row settled", () => {
    project("a");
    run("done", "a-chat", "failed", { ended: 150 });
    run("ending", "a-chat", "running");
    expect(activity.markSessionSeen("a", "a-chat", "ending")).toBe(true);
    expect(
      db.prepare(`SELECT run_id FROM runs WHERE seen_at IS NULL`).all(),
    ).toEqual([]);
    expect(publishActivity).toHaveBeenCalledWith({
      projectId: "a",
      sessionId: "a-chat",
      seen: true,
    });
    // nothing left to mark: no event
    publishActivity.mockClear();
    expect(activity.markSessionSeen("a", "a-chat")).toBe(false);
    expect(publishActivity).not.toHaveBeenCalled();
  });
});
