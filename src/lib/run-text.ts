import { db } from "./db";
import { markdownToPlainText } from "./markdown";

/* Reads over a run's persisted event log. Database only — run-manager,
 * activity and push all need these, and push must not import run-manager. */

function runEvents(runId: string): Record<string, unknown>[] {
  const rows = db
    .prepare(`SELECT event_json FROM run_events WHERE run_id = ? ORDER BY seq ASC`)
    .all(runId) as { event_json: string }[];
  const events: Record<string, unknown>[] = [];
  for (const row of rows) {
    try {
      events.push(JSON.parse(row.event_json) as Record<string, unknown>);
    } catch {
      // a malformed row must not cost the caller the rest of the log
    }
  }
  return events;
}

/**
 * What the agent actually said, reassembled from the message.delta log.
 *
 * Ours rather than Hermes': the transcript is fetched separately by the
 * browser, and a notification must not wait on a round trip to build its
 * own body.
 */
export function runText(runId: string): string {
  let text = "";
  let output = "";
  for (const event of runEvents(runId)) {
    if (event.event === "message.delta" && typeof event.delta === "string") {
      text += event.delta;
    } else if (event.event === "run.completed" && typeof event.output === "string") {
      output = event.output;
    }
  }
  // A turn into a Bot Chat that the Desktop holds live, or one admitted
  // under session authority, runs in the owner's mailbox. Its stream has no
  // deltas, only a run.completed that carries the whole reply.
  return text || output;
}

/**
 * The opening of the reply, for a completion notification.
 *
 * This used to be `prompt_preview` — the user's own message — so finishing a
 * run buzzed the phone with the text they had just typed. It read as a
 * notification *of their own message* rather than of the answer, which is
 * both useless and confusing. The reply is the news.
 *
 * Fenced blocks are dropped first: a turn that opens with a code block or a
 * recommendation card would otherwise notify with a brace.
 */
export function replyPreview(runId: string): string {
  return markdownToPlainText(runText(runId)).slice(0, 140);
}

export interface PendingApprovalSummary {
  command: string | null;
  /** what the gateway will accept for this one — `choices` on the event */
  choices: string[];
}

/** The approval a run is blocked on, from its request — null once answered. */
export function pendingApproval(runId: string): PendingApprovalSummary | null {
  let pending: PendingApprovalSummary | null = null;
  for (const event of runEvents(runId)) {
    if (event.event === "approval.request") {
      const raw =
        typeof event.command === "string" && event.command.trim()
          ? event.command
          : typeof event.description === "string"
            ? event.description
            : "";
      pending = {
        command: raw.trim() || null,
        choices: Array.isArray(event.choices)
          ? event.choices.filter((choice): choice is string => typeof choice === "string")
          : [],
      };
    } else if (event.event === "approval.responded") {
      pending = null;
    }
  }
  return pending;
}

/** The command an outstanding approval is asking about, from its request. */
export function pendingApprovalCommand(runId: string): string | null {
  return pendingApproval(runId)?.command ?? null;
}
