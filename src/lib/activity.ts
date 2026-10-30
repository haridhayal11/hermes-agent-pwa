import { publishActivity } from "./api-changes";
import { db } from "./db";
import { generalChat } from "./general-chat";
import { pendingApprovalCommand, replyPreview } from "./run-text";

/* What is happening across every project, for Home, the sidebar's dots and
 * the app badge. Database only: push.ts counts the badge from here, and it
 * must not pull in the Hermes client or the run manager. */

export type ActivityState = "approval" | "running" | "unseen" | "failed";

export interface ActivityItem {
  projectId: string;
  projectName: string;
  sessionId: string;
  sessionTitle: string;
  runId: string;
  state: ActivityState;
  /** started_at for a live run, ended_at for a settled one */
  at: number;
  /** the command awaiting approval, the reply's opening, or the prompt */
  detail: string;
}

export interface Activity {
  items: ActivityItem[];
  scheduled: { projectId: string; sessionId: string; unread: number } | null;
  badge: number;
}

const LIVE = ["queued", "running", "waiting_for_approval"];
/* Cancelled is absent on purpose: the user stopped it, so it is not news. */
const NEWS = ["completed", "failed"];
const PRECEDENCE: Record<ActivityState, number> = {
  approval: 0,
  running: 1,
  failed: 2,
  unseen: 3,
};
const MAX_SETTLED = 50;

interface RunJoin {
  run_id: string;
  project_id: string;
  project_name: string;
  session_id: string;
  session_title: string | null;
  status: string;
  started_at: number;
  ended_at: number | null;
  prompt_preview: string | null;
}

const VISIBLE = `
  JOIN projects p ON p.id = r.project_id AND p.archived = 0
  JOIN project_sessions s ON s.session_id = r.session_id
   AND s.archived = 0 AND s.retired_at IS NULL`;

function liveRuns(): RunJoin[] {
  return db
    .prepare(
      `SELECT r.*, p.name AS project_name, s.title AS session_title
         FROM runs r ${VISIBLE}
        WHERE r.status IN (${LIVE.map(() => "?").join(",")})
        ORDER BY r.started_at DESC`,
    )
    .all(...LIVE) as RunJoin[];
}

function unseenRuns(): RunJoin[] {
  return db
    .prepare(
      `SELECT r.*, p.name AS project_name, s.title AS session_title
         FROM runs r ${VISIBLE}
        WHERE r.seen_at IS NULL
          AND r.status IN (${NEWS.map(() => "?").join(",")})
        ORDER BY r.ended_at DESC LIMIT ?`,
    )
    .all(...NEWS, MAX_SETTLED * 4) as RunJoin[];
}

function stateOf(run: RunJoin): ActivityState {
  if (run.status === "waiting_for_approval") return "approval";
  if (LIVE.includes(run.status)) return "running";
  return run.status === "failed" ? "failed" : "unseen";
}

function detailFor(run: RunJoin, state: ActivityState): string {
  const prompt = run.prompt_preview?.trim() ?? "";
  if (state === "approval") return pendingApprovalCommand(run.run_id) ?? prompt;
  if (state === "unseen") return replyPreview(run.run_id) || prompt;
  return prompt;
}

/** One item per chat: the most pressing thing about it. */
function itemsByChat(): ActivityItem[] {
  const best = new Map<string, { run: RunJoin; state: ActivityState }>();
  for (const run of [...liveRuns(), ...unseenRuns()]) {
    const state = stateOf(run);
    const current = best.get(run.session_id);
    if (!current || PRECEDENCE[state] < PRECEDENCE[current.state]) {
      best.set(run.session_id, { run, state });
    }
  }
  return [...best.values()]
    .map(({ run, state }) => ({
      projectId: run.project_id,
      projectName: run.project_name,
      sessionId: run.session_id,
      sessionTitle: run.session_title ?? run.project_name,
      runId: run.run_id,
      state,
      at: state === "approval" || state === "running" ? run.started_at : (run.ended_at ?? run.started_at),
      detail: "",
      _run: run,
    }))
    .sort((a, b) => PRECEDENCE[a.state] - PRECEDENCE[b.state] || b.at - a.at)
    .slice(0, MAX_SETTLED)
    .map(({ _run, ...item }) => ({ ...item, detail: detailFor(_run, item.state) }));
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

/** Things waiting on the reader: approvals, replies nobody has opened, and
 * reports nobody has read. A chat that is merely busy does not count. */
function badgeFrom(items: ActivityItem[], scheduled: Activity["scheduled"]): number {
  return items.filter((item) => item.state !== "running").length + (scheduled?.unread ?? 0);
}

export function getActivity(): Activity {
  const items = itemsByChat();
  const scheduled = scheduledUnread();
  return { items, scheduled, badge: badgeFrom(items, scheduled) };
}

export function badgeCount(): number {
  return getActivity().badge;
}

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
