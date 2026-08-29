import { describe, expect, it } from "vitest";
import type { CronDelivery } from "./cron-watcher";
import { mergeProjectMessages, normalizeMessage } from "./message-normalization";

describe("message normalization", () => {
  it("preserves string ids and canonicalises numeric ids", () => {
    expect(normalizeMessage({ id: "m-1", role: "user" })).toMatchObject({
      id: "m-1",
      content_format: "plain",
    });
    expect(normalizeMessage({ id: 42, role: "assistant" })).toMatchObject({
      id: "42",
      content_format: "markdown",
    });
  });

  it("keeps an absent id absent", () => {
    expect(normalizeMessage({ role: "assistant" })).not.toHaveProperty("id");
  });

  it("preserves an explicit plain format on generated output", () => {
    expect(
      normalizeMessage({ role: "assistant", content_format: "plain" }).content_format,
    ).toBe("plain");
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
    expect(messages[0]).toMatchObject({
      role: "cron",
      content: "done",
      content_format: "markdown",
    });
  });
});
