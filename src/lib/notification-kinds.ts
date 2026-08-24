/* The notification vocabulary, on its own so both sides can see it.
 *
 * push.ts pulls in web-push and the SQLite handle, so a client component
 * importing the kinds from there would drag a native module into the browser
 * bundle. This file has no imports at all and is safe from either side.
 */

export type PushKind =
  | "run" // a run finished
  | "approval" // blocked on a dangerous-command approval
  | "question" // ended on a question card — waiting on you, but reads as done
  | "job" // a scheduled job delivered into a project
  | "job-failed"
  | "test";

/** The switchable ones, in the order Settings shows them. */
export const PUSH_KINDS: PushKind[] = [
  "run",
  "approval",
  "question",
  "job",
  "job-failed",
];

export const PUSH_KIND_LABELS: Record<Exclude<PushKind, "test">, string> = {
  run: "A run finishes",
  approval: "A command needs approving",
  question: "A question needs answering",
  job: "A scheduled job reports",
  "job-failed": "A scheduled job fails",
};

export const PUSH_KIND_HINTS: Record<Exclude<PushKind, "test">, string> = {
  run: "When it ends unwatched, or after it has been going longer than a minute.",
  approval: "Immediately if nothing is attached, and after a minute if something is — a locked phone still counts as attached.",
  question: "A run that stops to ask ends as “completed” like any other, so without this it announces itself as finished.",
  job: "The result of a job on Hermes' schedule, in the project it is bound to.",
  "job-failed": "Kept separate: a job that breaks is worth hearing about even when its ordinary reports are not.",
};
