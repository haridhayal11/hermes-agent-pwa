import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-run-status-"));
process.env.DB_PATH = path.join(directory, "state.db");

const { sendToAll, publishActivity } = vi.hoisted(() => ({
  sendToAll: vi.fn(async () => ({ sent: 1, failed: 0 })),
  publishActivity: vi.fn(),
}));
vi.mock("./push", () => ({ sendToAll }));
vi.mock("./api-changes", () => ({ publishActivity, publishChange: vi.fn() }));
vi.mock("./hermes", () => ({
  hermes: {},
  hermesFor: vi.fn(() => ({})),
  HermesApiError: class HermesApiError extends Error {},
}));

type Internals = {
  appendEvent: (runId: string, event: Record<string, unknown>) => number;
  finishRun: (runId: string, status: string) => void;
};

let db: typeof import("./db").db;
let runManager: typeof import("./run-manager").runManager;

beforeAll(async () => {
  db = (await import("./db")).db;
  runManager = (await import("./run-manager")).runManager;
  db.prepare(
    `INSERT INTO projects (id, name, session_id, created_at, last_active_at)
     VALUES ('p', 'Project', 'chat', 1, 1)`,
  ).run();
  db.prepare(
    `INSERT INTO project_sessions (session_id, project_id, title, created_at, last_active_at)
     VALUES ('chat', 'p', 'Chat', 1, 1)`,
  ).run();
});

afterAll(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec(`DELETE FROM run_events; DELETE FROM runs;`);
  sendToAll.mockClear();
  publishActivity.mockClear();
});

function insertRun(runId: string, status = "running", startedAt = Date.now()) {
  db.prepare(
    `INSERT INTO runs (run_id, project_id, session_id, status, started_at, prompt_preview)
     VALUES (?, 'p', 'chat', ?, ?, 'ship it')`,
  ).run(runId, status, startedAt);
}

const status = (runId: string) =>
  (db.prepare(`SELECT status FROM runs WHERE run_id = ?`).get(runId) as { status: string })
    .status;

const append = (runId: string, event: Record<string, unknown>) =>
  (runManager as unknown as Internals).appendEvent(runId, event);

describe("run status", () => {
  it("is kept current through an approval, and announced", () => {
    insertRun("r1");
    append("r1", { event: "approval.request", command: "deploy" });
    expect(status("r1")).toBe("waiting_for_approval");
    append("r1", { event: "approval.responded", choice: "once" });
    expect(status("r1")).toBe("running");
    expect(publishActivity).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "r1", status: "waiting_for_approval" }),
    );
  });

  it("never moves a settled run back", () => {
    insertRun("r2", "completed");
    append("r2", { event: "approval.responded", choice: "once" });
    expect(status("r2")).toBe("completed");
    expect(publishActivity).not.toHaveBeenCalled();
  });

  it("reminds an attached browser of an approval, linking to the card", async () => {
    vi.useFakeTimers();
    try {
      insertRun("r3");
      const unsubscribe = runManager.subscribe("r3", -1, () => {});
      append("r3", { event: "approval.request", command: "rm -rf build" });
      expect(sendToAll).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sendToAll).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "approval",
          body: "Approve? rm -rf build",
          url: "/p/p/s/chat?approval=r3",
        }),
      );
      unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the reply and the question it ends on past the event log, and pushes a question", () => {
    insertRun("r4");
    const card = { kind: "question", title: "Which card?", actions: [{ label: "Amex", reply: "amex" }] };
    append("r4", {
      event: "message.delta",
      delta: "Two cards on file.\n```hermes-recommend\n" + JSON.stringify(card) + "\n```",
    });
    (runManager as unknown as Internals).finishRun("r4", "completed");
    const row = db
      .prepare(`SELECT reply_preview, question_json FROM runs WHERE run_id = 'r4'`)
      .get() as { reply_preview: string; question_json: string };
    expect(row.reply_preview).toBe("Two cards on file.");
    expect(JSON.parse(row.question_json)).toMatchObject({ kind: "question", title: "Which card?" });
    expect(sendToAll).toHaveBeenCalledWith(expect.objectContaining({ kind: "question", body: "Which card?" }));
  });

  it("closes long-stranded runs on boot without a notification", () => {
    insertRun("ancient", "queued", Date.now() - 7 * 60 * 60_000);
    runManager.recoverActiveRuns();
    expect(status("ancient")).toBe("failed");
    expect(
      db.prepare(`SELECT seen_at IS NOT NULL AS seen FROM runs WHERE run_id = 'ancient'`).get(),
    ).toEqual({ seen: 1 });
    expect(
      db.prepare(`SELECT event_json FROM run_events WHERE run_id = 'ancient'`).get(),
    ).toMatchObject({ event_json: expect.stringContaining("run.failed") });
    expect(sendToAll).not.toHaveBeenCalled();
  });
});
