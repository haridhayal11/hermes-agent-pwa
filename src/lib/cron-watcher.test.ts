import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ db: {} }));
vi.mock("./hermes", () => ({ hermes: {} }));
vi.mock("./run-manager", () => ({ runManager: {} }));
vi.mock("./push", () => ({ sendToAll: vi.fn() }));
vi.mock("./project-sessions", () => ({ ensureScheduledSession: vi.fn() }));
vi.mock("./api-changes", () => ({ publishChange: vi.fn() }));

import { isSilent, parseJobOutput, planOutputFiles } from "./cron-watcher";

describe("scheduled output planning", () => {
  const files = [
    "/cron/job/2026-08-28_09-00-00.md",
    "/cron/job/2026-08-28_10-00-00.md",
    "/cron/job/2026-08-28_11-00-00.md",
  ];

  it("delivers every missed execution exactly once in chronological order", () => {
    const shuffled = [files[2], files[0], files[1]];
    expect(planOutputFiles(shuffled, files[0])).toEqual({
      adopt: null,
      pending: [files[1], files[2]],
    });
    expect(planOutputFiles(files, files[2])).toEqual({
      adopt: null,
      pending: [],
    });
  });

  it("delivers all future files for a new job but silently adopts legacy cursors", () => {
    expect(planOutputFiles(files, "").pending).toEqual(files);
    expect(planOutputFiles(files, null)).toEqual({ adopt: files[2], pending: [] });
    expect(planOutputFiles(files, "2026-08-28T09:00:00Z")).toEqual({
      adopt: files[2],
      pending: [],
    });
  });

  it("retains failed output and suppresses silent successful output", () => {
    expect(
      parseJobOutput("# Cron Job: Daily (FAILED)\n\n## Prompt\nx\n\n## Error\nboom"),
    ).toEqual({ status: "failed", body: "boom" });
    expect(isSilent("\n[SILENT]\n")).toBe(true);
    expect(isSilent("The word SILENT is part of this report.")).toBe(false);
  });
});
