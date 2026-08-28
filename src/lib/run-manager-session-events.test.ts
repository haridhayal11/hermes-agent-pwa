import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ db: { prepare: vi.fn(), transaction: vi.fn() } }));
vi.mock("./hermes", () => ({
  hermes: {},
  HermesApiError: class HermesApiError extends Error {},
}));
vi.mock("./instructions", () => ({ composeInstructions: vi.fn(), parseSkills: vi.fn() }));
vi.mock("./uploads", () => ({ outboxDirFor: vi.fn() }));
vi.mock("./push", () => ({ sendToAll: vi.fn() }));
vi.mock("./project-sessions", () => ({
  autoNameSession: vi.fn(),
  getProjectSession: vi.fn(),
}));

import { runManager, scheduledReportHistoryEntry } from "./run-manager";

describe("session-scoped project events", () => {
  it("never sends a Scheduled delivery to another session subscriber", () => {
    const normal = vi.fn();
    const scheduled = vi.fn();
    const projectWide = vi.fn();
    const unsubscribeNormal = runManager.subscribeProject("project", normal, "chat");
    const unsubscribeScheduled = runManager.subscribeProject(
      "project",
      scheduled,
      "scheduled",
    );
    const unsubscribeProject = runManager.subscribeProject("project", projectWide);

    const event = { event: "cron.delivered", delivery: { id: "delivery" } };
    runManager.emitProject("project", "scheduled", event);

    expect(normal).not.toHaveBeenCalled();
    expect(scheduled).toHaveBeenCalledWith(event);
    expect(projectWide).toHaveBeenCalledWith(event);
    unsubscribeNormal();
    unsubscribeScheduled();
    unsubscribeProject();
  });

  it("formats the linked report as persistent assistant context", () => {
    expect(
      scheduledReportHistoryEntry({
        job_name: "Daily check",
        status: "failed",
        body: "Service unavailable",
        ts: Date.parse("2026-08-28T09:30:00.000Z"),
      }),
    ).toEqual({
      role: "assistant",
      content:
        '[failed scheduled report from "Daily check" at 2026-08-28T09:30:00.000Z]\nService unavailable',
    });
  });
});
