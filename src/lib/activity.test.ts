import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-activity-"));
process.env.DB_PATH = path.join(directory, "state.db");

const { publishActivity, publishChange } = vi.hoisted(() => ({
  publishActivity: vi.fn(),
  publishChange: vi.fn(),
}));
vi.mock("./api-changes", () => ({ publishActivity, publishChange }));

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

const NOW = Date.parse("2026-10-30T12:00:00Z");
const MIN = 60_000;
const QUESTION = {
  kind: "question",
  title: "Which card for the Amazon order?",
  actions: [
    { label: "Amex", reply: "use the Amex" },
    { label: "Visa", reply: "use the Visa" },
  ],
};
const fence = (card: object) => "```hermes-recommend\n" + JSON.stringify(card) + "\n```";

function project(id: string, archived = 0) {
  db.prepare(
    `INSERT INTO projects (id, name, session_id, created_at, last_active_at, archived)
     VALUES (?, ?, ?, 1, 1, ?)`,
  ).run(id, `Project ${id}`, `${id}-chat`, archived);
  db.prepare(
    `INSERT INTO project_sessions (session_id, project_id, title, created_at, last_active_at)
     VALUES (?, ?, ?, 1, 1)`,
  ).run(`${id}-chat`, id, `Project ${id}`);
}

function run(
  runId: string,
  projectId: string,
  status: string,
  {
    started = 30,
    ended = null as number | null,
    seen = null as number | null,
    reply = null as string | null,
    question = null as object | null,
  } = {},
) {
  db.prepare(
    `INSERT INTO runs (run_id, project_id, session_id, status, started_at, ended_at,
                       prompt_preview, seen_at, reply_preview, question_json)
     VALUES (?, ?, ?, ?, ?, ?, 'do it', ?, ?, ?)`,
  ).run(
    runId,
    projectId,
    `${projectId}-chat`,
    status,
    NOW - started * MIN,
    ended === null ? null : NOW - ended * MIN,
    seen === null ? null : NOW - seen * MIN,
    reply,
    question ? JSON.stringify(question) : null,
  );
}

function report(id: string, projectId: string, body: string, ago: number, read = false) {
  db.prepare(
    `INSERT INTO cron_deliveries (id, job_id, project_id, session_id, job_name, status, body, source_path, ts, read_at)
     VALUES (?, 'job', ?, ?, 'Morning brief', 'ok', ?, ?, ?, ?)`,
  ).run(id, projectId, `${projectId}-chat`, body, `/out/${id}.md`, NOW - ago * MIN, read ? NOW : null);
}

beforeEach(() => {
  db.exec(`DELETE FROM run_events; DELETE FROM runs; DELETE FROM cron_deliveries;
           DELETE FROM project_sessions; DELETE FROM projects; DELETE FROM app_settings;`);
  publishActivity.mockClear();
  publishChange.mockClear();
});

describe("notifications feed", () => {
  it("holds what waits on you at the top, then the rest newest first", () => {
    project("a");
    project("b");
    project("g");
    run("approve", "a", "waiting_for_approval", { started: 50 });
    db.prepare(`INSERT INTO run_events (run_id, seq, event_json, ts) VALUES ('approve', 0, ?, 1)`).run(
      JSON.stringify({ event: "approval.request", command: "rm -rf build", choices: ["once", "deny"] }),
    );
    run("reply", "b", "completed", { ended: 5, reply: "Done — 3 PRs merged." });
    run("failed", "b", "failed", { started: 40, ended: 39 });
    report("brief", "g", `Your day.\n\n${fence(QUESTION)}`, 20);

    const { feed, badge } = activity.getActivity(NOW);
    expect(feed.map((item) => [item.id, item.kind])).toEqual([
      ["report:brief", "question"],
      ["run:approve", "approval"],
      ["run:reply", "reply"],
      ["run:failed", "failed"],
    ]);
    expect(feed[0]).toMatchObject({ title: QUESTION.title, question: { actions: QUESTION.actions } });
    expect(feed[1]).toMatchObject({ body: "rm -rf build", choices: ["once", "deny"], unread: true });
    expect(feed[2]).toMatchObject({ body: "Done — 3 PRs merged." });
    expect(badge).toBe(4);
  });

  it("leaves out runs you watched end, cancelled runs, archived projects and old news", () => {
    project("a");
    project("z", 1);
    run("watched", "a", "completed", { ended: 10, seen: 10 });
    run("stopped", "a", "cancelled", { ended: 9 });
    run("hidden", "z", "completed", { ended: 8 });
    run("ancient", "a", "completed", { started: 30 * 24 * 60, ended: 30 * 24 * 60 });
    expect(activity.getActivity(NOW)).toMatchObject({ feed: [], badge: 0 });
  });

  it("keeps a run that finished unwatched, read once you open the chat", () => {
    project("a");
    run("away", "a", "completed", { ended: 60, seen: 5 });
    expect(activity.getActivity(NOW).feed).toMatchObject([{ id: "run:away", unread: false }]);
  });

  it("closes a question once anything happens in its chat after it", () => {
    project("a");
    run("asked", "a", "completed", { started: 30, ended: 29, seen: 29, question: QUESTION });
    expect(activity.getActivity(NOW).items).toMatchObject([{ sessionId: "a-chat", state: "question" }]);

    run("answer", "a", "completed", { started: 10, ended: 9, seen: 9 });
    const { feed, items } = activity.getActivity(NOW);
    // seen at the end it was watched, and no longer a question: nothing left
    expect(feed).toEqual([]);
    expect(items).toEqual([]);
  });

  it("marks everything read but leaves approvals waiting", () => {
    project("a");
    run("approve", "a", "waiting_for_approval");
    run("reply", "a", "completed", { started: 20, ended: 10 });
    report("brief", "a", "All quiet.", 15);
    expect(activity.getActivity(NOW).badge).toBe(3);

    expect(activity.markAllRead()).toBe(2);
    expect(activity.getActivity(NOW).badge).toBe(1);
    expect(publishChange).toHaveBeenCalledWith("cron.read", { allRead: true });
    expect(publishActivity).toHaveBeenCalledWith({ allRead: true });
  });
});

describe("markSessionSeen", () => {
  it("marks a chat seen, including the run it watched end before the row settled", () => {
    project("a");
    run("done", "a", "failed", { ended: 5 });
    run("ending", "a", "running");
    expect(activity.markSessionSeen("a", "a-chat", "ending")).toBe(true);
    expect(db.prepare(`SELECT run_id FROM runs WHERE seen_at IS NULL`).all()).toEqual([]);
    expect(publishActivity).toHaveBeenCalledWith({ projectId: "a", sessionId: "a-chat", seen: true });
    publishActivity.mockClear();
    expect(activity.markSessionSeen("a", "a-chat")).toBe(false);
    expect(publishActivity).not.toHaveBeenCalled();
  });
});
