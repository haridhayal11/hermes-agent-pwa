import { describe, expect, it } from "vitest";
import type { CronDelivery } from "./cron-watcher";
import { mergeProjectMessages, normalizeMessage } from "./message-normalization";

describe("message normalization", () => {
  it("preserves string ids and canonicalises numeric ids", () => {
    expect(normalizeMessage({ id: "m-1", role: "user" }).id).toBe("m-1");
    expect(normalizeMessage({ id: 42, role: "assistant" }).id).toBe("42");
  });

  it("keeps an absent id absent", () => {
    expect(normalizeMessage({ role: "assistant" })).not.toHaveProperty("id");
  });

  it("merges cron deliveries with canonical string ids", () => {
    const delivery: CronDelivery = {
      id: "delivery-1",
      job_id: "job-1",
      project_id: "project-1",
      session_id: "session-1",
      job_name: "Daily check",
      status: "ok",
      body: "done",
      source_path: null,
      ts: 2_000,
      read_at: null,
    };
    const messages = mergeProjectMessages(
      [{ id: 7, role: "assistant", timestamp: 3 }],
      [delivery],
    );

    expect(messages.map((message) => message.id)).toEqual(["delivery-1", "7"]);
    expect(messages[0]).toMatchObject({ role: "cron", content: "done" });
  });
});
