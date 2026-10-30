import { describe, expect, it } from "vitest";
import {
  exportFilename,
  parseExportFormat,
  transcriptJson,
  transcriptMarkdown,
  type ExportMeta,
} from "./transcript-export";

const meta: ExportMeta = {
  projectName: "Garden",
  sessionTitle: "Tomato plan: week 2!",
  agentName: "Hermes",
  sessionId: "s1",
  exportedAt: Date.parse("2026-10-30T09:15:00Z"),
};

describe("transcript export", () => {
  it("reads as a document, speaker by speaker", () => {
    const md = transcriptMarkdown(meta, [
      { id: "1", role: "user", content: "Water how often?", contentFormat: "plain", createdAt: Date.parse("2026-10-29T08:00:00Z") },
      { id: "2", role: "assistant", content: "Every **two** days.\n", contentFormat: "markdown" },
      {
        id: "3",
        role: "cron",
        content: "Soil is dry.",
        contentFormat: "markdown",
        cron: { jobId: "j", jobName: "Moisture", status: "failed", ts: 1 },
      },
    ]);
    expect(md).toBe(
      [
        "# Tomato plan: week 2!",
        "",
        "Garden · exported 2026-10-30 09:15 UTC",
        "",
        "---",
        "",
        "### You · 2026-10-29 08:00 UTC",
        "",
        "Water how often?",
        "",
        "---",
        "",
        "### Hermes",
        "",
        "Every **two** days.",
        "",
        "---",
        "",
        "### Scheduled report · Moisture (failed)",
        "",
        "Soil is dry.",
        "",
      ].join("\n"),
    );
  });

  it("keeps every raw row in JSON, tool calls included", () => {
    const parsed = JSON.parse(transcriptJson(meta, [{ role: "tool", content: "ok" }]));
    expect(parsed).toEqual({
      project: "Garden",
      session: { id: "s1", title: "Tomato plan: week 2!" },
      exportedAt: "2026-10-30T09:15:00.000Z",
      messages: [{ role: "tool", content: "ok" }],
    });
  });

  it("names files safely and parses the format argument", () => {
    expect(exportFilename(meta, "md")).toBe("tomato-plan-week-2-2026-10-30.md");
    expect(exportFilename({ ...meta, sessionTitle: "", projectName: "✨" }, "json")).toBe(
      "chat-2026-10-30.json",
    );
    expect(parseExportFormat(undefined)).toBe("md");
    expect(parseExportFormat(" JSON ")).toBe("json");
    expect(parseExportFormat("html")).toBeNull();
  });
});
