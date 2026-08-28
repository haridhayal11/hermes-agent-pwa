import { beforeEach, describe, expect, it, vi } from "vitest";

const { prepare, publishChange, transaction } = vi.hoisted(() => ({
  prepare: vi.fn(),
  publishChange: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("./api-changes", () => ({ publishChange }));
vi.mock("./db", () => ({ db: { prepare, transaction } }));
vi.mock("./hermes", () => ({
  hermes: {},
  HermesApiError: class HermesApiError extends Error {},
}));
vi.mock("./project-session", () => ({
  createProjectSession: vi.fn(),
  renameProjectSession: vi.fn(),
}));
vi.mock("./session-title", () => ({ titleFromPrompt: vi.fn() }));

import {
  forkProjectSession,
  markScheduledRead,
  projectEntrySession,
  selectProjectSession,
  type ProjectSessionRow,
} from "./project-sessions";

function session(kind: "chat" | "scheduled", id = `session-${kind}`): ProjectSessionRow {
  return {
    session_id: id,
    project_id: "project-1",
    title: kind === "scheduled" ? "Scheduled" : "Chat",
    parent_session_id: null,
    created_at: 1,
    last_active_at: 2,
    archived: 0,
    kind,
  };
}

describe("selectProjectSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the last normal chat without broadcasting client navigation", () => {
    const selected = session("chat", "session-1");
    const update = vi.fn();
    prepare.mockImplementation((sql: string) =>
      sql.includes("SELECT * FROM project_sessions")
        ? { get: vi.fn().mockReturnValue(selected) }
        : { run: update },
    );

    expect(selectProjectSession("project-1", "session-1")).toBe(selected);
    expect(update).toHaveBeenCalledWith("session-1", expect.any(Number), "project-1");
    expect(transaction).not.toHaveBeenCalled();
    expect(publishChange).not.toHaveBeenCalled();
  });

  it("never replaces the last normal chat when Scheduled is selected", () => {
    const scheduled = session("scheduled");
    prepare.mockReturnValue({ get: vi.fn().mockReturnValue(scheduled) });

    expect(selectProjectSession("project-1", scheduled.session_id)).toBe(scheduled);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("resolves unread Scheduled first, then the most recently active normal chat", () => {
    const scheduled = session("scheduled");
    const chat = session("chat", "recent-chat");
    let unread = 1;
    prepare.mockImplementation((sql: string) => {
      if (sql.includes("kind = 'scheduled'")) {
        return { get: vi.fn().mockReturnValue(scheduled) };
      }
      if (sql.includes("COUNT(*) AS count")) {
        return { get: vi.fn().mockImplementation(() => ({ count: unread })) };
      }
      if (sql.includes("kind = 'chat'")) {
        return { get: vi.fn().mockReturnValue(chat) };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    });

    expect(projectEntrySession("project-1")).toBe(scheduled);
    unread = 0;
    expect(projectEntrySession("project-1")).toBe(chat);
  });

  it("marks every unread report and publishes the shared badge change", () => {
    const scheduled = session("scheduled");
    const mark = vi.fn().mockReturnValue({ changes: 3 });
    prepare.mockImplementation((sql: string) =>
      sql.includes("kind = 'scheduled'")
        ? { get: vi.fn().mockReturnValue(scheduled) }
        : { run: mark },
    );

    expect(markScheduledRead("project-1")).toBe(3);
    expect(mark).toHaveBeenCalledWith(
      expect.any(Number),
      "project-1",
      scheduled.session_id,
    );
    expect(publishChange).toHaveBeenCalledWith("cron.read", {
      projectId: "project-1",
      sessionId: scheduled.session_id,
    });
  });

  it("refuses to fork the protected Scheduled session", async () => {
    const scheduled = session("scheduled");
    prepare.mockReturnValue({ get: vi.fn().mockReturnValue(scheduled) });

    await expect(
      forkProjectSession("project-1", scheduled.session_id),
    ).resolves.toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });
});
