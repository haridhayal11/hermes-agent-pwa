import { publishActivity, publishChange } from "./api-changes";
import type { Recommendation } from "./chat-types";
import { db } from "./db";
import { generalChat } from "./general-chat";
import { markdownToPlainText } from "./markdown";
import { extractQuestion } from "./recommendation";
import { pendingApproval, pendingClarify } from "./run-text";

/* What is happening across every project: the notifications panel, the
 * sidebar's dots and the app badge. Database only — push.ts counts the badge
 * from here, and it must not pull in the Hermes client or the run manager.
 *
 * Nothing here is stored. The panel is derived from what the app already
 * keeps — run status and `seen_at`, report `read_at` — so there is exactly
 * one notion of "read": opening the chat. A notifications table would be a
 * second copy of that to drift. */

/* ---- the feed ------------------------------------------------------------ */

export type NotificationKind = "approval" | "question" | "reply" | "failed" | "report";

export interface NotificationItem {
  /** `run:<id>` or `report:<id>` */
  id: string;
  kind: NotificationKind;
  projectId: string;
  projectName: string;
  sessionId: string;
  sessionTitle: string;
  at: number;
  /** a report's job name, or a question's own title; null for the rest */
  title: string | null;
  /** a plain-text preview: the reply, the report, the command, the prompt */
  body: string;
  unread: boolean;
  runId?: string;
  /** an approval's offered choices */
  choices?: string[];
  /** an open question's card, answerable from the panel */
  question?: Recommendation;
  /** the question is a run's mid-run clarify: it is answered at
   *  `/api/runs/{runId}/clarify`, never as a chat message, which would only
   *  queue behind the run it is meant to unblock */
  clarify?: boolean;
}

const FEED_DAYS = 14;
const FEED_LIMIT = 60;
/* A run whose end the reader watched is stamped seen at the terminal event,
 * a beat either side of ended_at. Anything seen later than this finished
 * while nobody was looking, and is news. */
const WATCHED_GRACE_MS = 10_000;

const VISIBLE_RUN = `
  JOIN projects p ON p.id = r.project_id AND p.archived = 0
  JOIN project_sessions s ON s.session_id = r.session_id
   AND s.archived = 0 AND s.retired_at IS NULL`;

interface RunRow {
  run_id: string;
  project_id: string;
  project_name: string;
  session_id: string;
  session_title: string | null;
  status: string;
  started_at: number;
  ended_at: number | null;
  seen_at: number | null;
  prompt_preview: string | null;
  reply_preview: string | null;
  question_json: string | null;
}

interface ReportRow {
  id: string;
  project_id: string;
  project_name: string;
  session_id: string;
  session_title: string | null;
  job_name: string;
  status: string;
  body: string;
  ts: number;
  read_at: number | null;
}

function approvalRuns(): RunRow[] {
  return db
    .prepare(
      `SELECT r.*, p.name AS project_name, s.title AS session_title
         FROM runs r ${VISIBLE_RUN}
        WHERE r.status = 'waiting_for_approval'
        ORDER BY r.started_at DESC`,
    )
    .all() as RunRow[];
}

/* Unwatched runs, plus any run ending on a question — an open question is
 * waiting on you whether or not you saw it arrive. */
function settledRuns(since: number): RunRow[] {
  return db
    .prepare(
      `SELECT r.*, p.name AS project_name, s.title AS session_title
         FROM runs r ${VISIBLE_RUN}
        WHERE r.status IN ('completed', 'failed') AND r.ended_at >= ?
          AND (r.seen_at IS NULL OR r.seen_at > r.ended_at + ? OR r.question_json IS NOT NULL)
        ORDER BY r.ended_at DESC LIMIT ?`,
    )
    .all(since, WATCHED_GRACE_MS, FEED_LIMIT) as RunRow[];
}

function reports(since: number): ReportRow[] {
  return db
    .prepare(
      `SELECT d.id, d.project_id, p.name AS project_name, d.session_id,
              s.title AS session_title, d.job_name, d.status, d.body, d.ts, d.read_at
         FROM cron_deliveries d
         JOIN projects p ON p.id = d.project_id AND p.archived = 0
         JOIN project_sessions s ON s.session_id = d.session_id AND s.retired_at IS NULL
        WHERE d.ts >= ?
        ORDER BY d.ts DESC LIMIT ?`,
    )
    .all(since, FEED_LIMIT) as ReportRow[];
}

/** The newest run start and report per chat: a question is only open while
 *  nothing has happened in its chat since it was asked. */
function latestPerChat(since: number) {
  const runs = new Map(
    (
      db
        .prepare(
          `SELECT session_id, MAX(started_at) AS at FROM runs
            WHERE started_at >= ? GROUP BY session_id`,
        )
        .all(since) as { session_id: string; at: number }[]
    ).map((row) => [row.session_id, row.at]),
  );
  const deliveries = new Map(
    (
      db
        .prepare(
          `SELECT session_id, MAX(ts) AS at FROM cron_deliveries
            WHERE ts >= ? GROUP BY session_id`,
        )
        .all(since) as { session_id: string; at: number }[]
    ).map((row) => [row.session_id, row.at]),
  );
  return { runs, deliveries };
}

function parseQuestion(json: string | null): Recommendation | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Recommendation;
  } catch {
    return null;
  }
}

const where = (row: { project_id: string; project_name: string; session_id: string; session_title: string | null }) => ({
  projectId: row.project_id,
  projectName: row.project_name,
  sessionId: row.session_id,
  sessionTitle: row.session_title ?? row.project_name,
});

/* Waiting on you first — an approval or a question buried under newer
 * reports is one you miss — then everything else, newest first. */
const WAITING: NotificationKind[] = ["approval", "question"];

export function buildFeed(now = Date.now()): NotificationItem[] {
  const since = now - FEED_DAYS * 24 * 60 * 60_000;
  const latest = latestPerChat(since);
  const feed: NotificationItem[] = [];

  for (const run of approvalRuns()) {
    // waiting_for_approval covers a mid-run clarify too: same block, but it
    // is a question, and reads as one.
    const clarify = pendingClarify(run.run_id);
    if (clarify) {
      feed.push({
        id: `run:${run.run_id}`,
        kind: "question",
        ...where(run),
        at: run.started_at,
        title: clarify.question || "A question needs answering",
        body: "",
        unread: true,
        runId: run.run_id,
        clarify: true,
        // A multi-select has no single-tap answer; opening the chat does it.
        question: {
          kind: "question",
          title: clarify.question,
          actions: clarify.multiSelect
            ? []
            : clarify.choices.map((choice) => ({ label: choice, reply: choice })),
        },
      });
      continue;
    }
    const pending = pendingApproval(run.run_id);
    feed.push({
      id: `run:${run.run_id}`,
      kind: "approval",
      ...where(run),
      at: run.started_at,
      title: null,
      body: pending?.command ?? run.prompt_preview?.trim() ?? "",
      unread: true,
      runId: run.run_id,
      choices: pending?.choices ?? [],
    });
  }

  for (const run of settledRuns(since)) {
    const ended = run.ended_at ?? run.started_at;
    const question = parseQuestion(run.question_json);
    const open =
      question !== null &&
      (latest.runs.get(run.session_id) ?? 0) <= run.started_at &&
      (latest.deliveries.get(run.session_id) ?? 0) <= ended;
    const unwatched = run.seen_at === null || run.seen_at > ended + WATCHED_GRACE_MS;
    if (!open && !unwatched) continue;
    const prompt = run.prompt_preview?.trim() ?? "";
    feed.push({
      id: `run:${run.run_id}`,
      kind: open ? "question" : run.status === "failed" ? "failed" : "reply",
      ...where(run),
      at: ended,
      title: open ? question.title : null,
      body: run.status === "failed" ? prompt : run.reply_preview || prompt,
      unread: run.seen_at === null,
      runId: run.run_id,
      ...(open ? { question } : {}),
    });
  }

  for (const report of reports(since)) {
    const question = report.status === "failed" ? null : extractQuestion(report.body);
    const open =
      question !== null &&
      (latest.runs.get(report.session_id) ?? 0) <= report.ts &&
      (latest.deliveries.get(report.session_id) ?? 0) <= report.ts;
    feed.push({
      id: `report:${report.id}`,
      kind: open ? "question" : "report",
      ...where(report),
      at: report.ts,
      title: open ? question.title : report.job_name,
      body:
        report.status === "failed"
          ? "The scheduled run failed."
          : markdownToPlainText(report.body).slice(0, 200),
      unread: report.read_at === null,
      ...(open ? { question } : {}),
    });
  }

  return feed
    .sort(
      (a, b) =>
        Number(WAITING.includes(b.kind)) - Number(WAITING.includes(a.kind)) || b.at - a.at,
    )
    .slice(0, FEED_LIMIT);
}

/* ---- per-chat state, for the sidebar's dots ------------------------------ */

export type ActivityState = "approval" | "question" | "running" | "unseen" | "failed";

export interface ActivityItem {
  projectId: string;
  projectName: string;
  sessionId: string;
  sessionTitle: string;
  state: ActivityState;
  at: number;
}

export interface Activity {
  items: ActivityItem[];
  feed: NotificationItem[];
  scheduled: { projectId: string; sessionId: string; unread: number } | null;
  badge: number;
}

const PRECEDENCE: Record<ActivityState, number> = {
  approval: 0,
  question: 1,
  running: 2,
  failed: 3,
  unseen: 4,
};

const FEED_STATE: Partial<Record<NotificationKind, ActivityState>> = {
  approval: "approval",
  question: "question",
  failed: "failed",
  reply: "unseen",
};

function runningChats(): ActivityItem[] {
  return (
    db
      .prepare(
        `SELECT r.*, p.name AS project_name, s.title AS session_title
           FROM runs r ${VISIBLE_RUN}
          WHERE r.status IN ('queued', 'running')`,
      )
      .all() as RunRow[]
  ).map((run) => ({ ...where(run), state: "running" as const, at: run.started_at }));
}

/** One state per chat: the most pressing thing about it. A question stays
 *  until it is answered; a reply only until it is seen. */
function itemsByChat(feed: NotificationItem[]): ActivityItem[] {
  const best = new Map<string, ActivityItem>();
  const offer = (item: ActivityItem) => {
    const current = best.get(item.sessionId);
    if (!current || PRECEDENCE[item.state] < PRECEDENCE[current.state]) {
      best.set(item.sessionId, item);
    }
  };
  for (const item of runningChats()) offer(item);
  for (const item of feed) {
    const state = FEED_STATE[item.kind];
    if (!state) continue;
    if ((state === "unseen" || state === "failed") && !item.unread) continue;
    offer({
      projectId: item.projectId,
      projectName: item.projectName,
      sessionId: item.sessionId,
      sessionTitle: item.sessionTitle,
      state,
      at: item.at,
    });
  }
  return [...best.values()];
}

function scheduledUnread(): Activity["scheduled"] {
  const general = generalChat();
  if (!general) return null;
  const { count } = db
    .prepare(
      `SELECT COUNT(*) AS count FROM cron_deliveries
        WHERE project_id = ? AND session_id = ? AND read_at IS NULL`,
    )
    .get(general.projectId, general.sessionId) as { count: number };
  return { projectId: general.projectId, sessionId: general.sessionId, unread: count };
}

export function getActivity(now = Date.now()): Activity {
  const feed = buildFeed(now);
  return {
    items: itemsByChat(feed),
    feed,
    scheduled: scheduledUnread(),
    // Everything unread in the panel, which counts approvals as unread for as
    // long as they wait. A chat that is merely busy does not count.
    badge: feed.filter((item) => item.unread).length,
  };
}

export function badgeCount(): number {
  return getActivity().badge;
}

/* ---- read state ---------------------------------------------------------- */

/**
 * The reader has looked at this chat, so whatever it finished is no longer
 * news. Called by the thread when it is open and visible — not by an attached
 * stream, which an iPhone keeps open behind the lock screen.
 *
 * `runId` is the run the thread just watched end. The browser sees the
 * terminal event in the log a moment before run-manager settles the row, so
 * that one is stamped whatever its status says; finishRun keeps the stamp.
 */
export function markSessionSeen(
  projectId: string,
  sessionId: string,
  runId?: string,
): boolean {
  const now = Date.now();
  let changes = db
    .prepare(
      `UPDATE runs SET seen_at = ?
        WHERE project_id = ? AND session_id = ? AND seen_at IS NULL
          AND status IN ('completed', 'failed', 'cancelled')`,
    )
    .run(now, projectId, sessionId).changes;
  if (runId) {
    changes += db
      .prepare(
        `UPDATE runs SET seen_at = ?
          WHERE run_id = ? AND project_id = ? AND session_id = ? AND seen_at IS NULL`,
      )
      .run(now, runId, projectId, sessionId).changes;
  }
  if (changes === 0) return false;
  publishActivity({ projectId, sessionId, seen: true });
  return true;
}

/** "Mark all read" in the panel: every settled run seen, every report read.
 *  An approval stays — it is read only by answering it. */
export function markAllRead(): number {
  const now = Date.now();
  const { runs, reports } = db.transaction(() => ({
    runs: db
      .prepare(
        `UPDATE runs SET seen_at = ?
          WHERE seen_at IS NULL AND status IN ('completed', 'failed', 'cancelled')`,
      )
      .run(now).changes,
    reports: db
      .prepare(`UPDATE cron_deliveries SET read_at = ? WHERE read_at IS NULL`)
      .run(now).changes,
  }))();
  // Report read state is also on the durable feed: the sidebar's unread
  // count is server-rendered, and native clients show it too.
  if (reports > 0) publishChange("cron.read", { allRead: true });
  if (runs + reports > 0) publishActivity({ allRead: true });
  return runs + reports;
}
