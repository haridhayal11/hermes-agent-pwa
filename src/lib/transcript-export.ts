import type { ThreadMessage } from "./chat-types";

/* A chat as a file you can keep: Markdown to read, JSON to process.
 *
 * Both are built from the full history Hermes returns, not from the thread
 * in the browser — that holds at most the newest 500 rows after a refresh.
 * Pure, so the route stays thin and this stays testable. */

export type ExportFormat = "md" | "json";

export interface ExportMeta {
  projectName: string;
  sessionTitle: string;
  agentName: string;
  sessionId: string;
  exportedAt: number;
}

export function parseExportFormat(raw: string | null | undefined): ExportFormat | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "" || value === "md" || value === "markdown") return "md";
  if (value === "json") return "json";
  return null;
}

/** UTC, minute precision: a file outlives the timezone it was written in. */
function stamp(ts: number): string {
  return `${new Date(ts).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function speaker(message: ThreadMessage, agentName: string): string {
  switch (message.role) {
    case "user":
      return "You";
    case "assistant":
      return agentName;
    case "system":
      return "System";
    case "cron":
      return message.cron
        ? `Scheduled report · ${message.cron.jobName}${message.cron.status === "failed" ? " (failed)" : ""}`
        : "Scheduled report";
  }
}

export function transcriptMarkdown(meta: ExportMeta, messages: ThreadMessage[]): string {
  const title = meta.sessionTitle || meta.projectName;
  const lines = [
    `# ${title}`,
    "",
    `${meta.projectName} · exported ${stamp(meta.exportedAt)}`,
  ];
  for (const message of messages) {
    const when = message.createdAt ? ` · ${stamp(message.createdAt)}` : "";
    lines.push("", "---", "", `### ${speaker(message, meta.agentName)}${when}`, "", message.content.trimEnd());
  }
  return `${lines.join("\n")}\n`;
}

/** Every row as Hermes returned it, tool calls included, under a small header. */
export function transcriptJson(meta: ExportMeta, raw: unknown[]): string {
  return `${JSON.stringify(
    {
      project: meta.projectName,
      session: { id: meta.sessionId, title: meta.sessionTitle },
      exportedAt: new Date(meta.exportedAt).toISOString(),
      messages: raw,
    },
    null,
    2,
  )}\n`;
}

/** "my-project-2026-10-30.md" — safe on every filesystem a phone shares to. */
export function exportFilename(meta: ExportMeta, format: ExportFormat): string {
  const slug =
    (meta.sessionTitle || meta.projectName)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "chat";
  const date = new Date(meta.exportedAt).toISOString().slice(0, 10);
  return `${slug}-${date}.${format}`;
}
