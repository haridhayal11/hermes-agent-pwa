import { randomUUID } from "node:crypto";
import { publishChange } from "./api-changes";
import { db } from "./db";
import { botName, hermesForProject } from "./bots";
import { HermesApiError, type HermesSession } from "./hermes";
import { generalChat } from "./general-chat";
import { createProjectSession, renameProjectSession } from "./project-session";
import { titleFromPrompt } from "./session-title";

export interface ProjectSessionRow {
  session_id: string;
  project_id: string;
  title: string;
  parent_session_id: string | null;
  created_at: number;
  last_active_at: number;
  archived: number;
  kind: "chat" | "scheduled";
  /** 1 when this is the bound Bot's canonical Bot Chat (see bots.ts) */
  bot_chat: number;
  /** set when the Scheduled-inbox retirement hid this thread */
  retired_at?: number | null;
  /** 1 when brought in from another Hermes client (see adoptSession) */
  imported?: number;
}

export function sessionDto(session: ProjectSessionRow) {
  return {
    id: session.session_id,
    projectId: session.project_id,
    title: session.title,
    parentSessionId: session.parent_session_id,
    createdAt: session.created_at,
    lastActiveAt: session.last_active_at,
    archived: session.archived === 1,
    kind: session.kind,
    botChat: session.bot_chat === 1,
  };
}

export function listProjectSessions(
  projectId: string,
  includeArchived = false,
): ProjectSessionRow[] {
  return db
    .prepare(
      `SELECT * FROM project_sessions
        WHERE project_id = ? ${includeArchived ? "" : "AND archived = 0"}
        ORDER BY last_active_at DESC, created_at DESC, session_id ASC`,
    )
    .all(projectId) as ProjectSessionRow[];
}

export function getProjectSession(
  projectId: string,
  sessionId: string,
): ProjectSessionRow | undefined {
  return db
    .prepare(
      `SELECT * FROM project_sessions WHERE project_id = ? AND session_id = ?`,
    )
    .get(projectId, sessionId) as ProjectSessionRow | undefined;
}

export function registerInitialSession(
  projectId: string,
  sessionId: string,
  title: string,
  now: number,
  botChat = false,
) {
  db.prepare(
    `INSERT INTO project_sessions
      (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived, bot_chat)
     VALUES (?, ?, ?, NULL, ?, ?, 0, ?)`,
  ).run(sessionId, projectId, title, now, now, botChat ? 1 : 0);
  publishChange("session.changed", { projectId, sessionId });
}

export function selectProjectSession(projectId: string, sessionId: string) {
  const session = getProjectSession(projectId, sessionId);
  if (!session || session.archived === 1) return null;
  if (session.kind === "chat") {
    db.prepare(
      `UPDATE projects SET last_chat_session_id = ?, last_active_at = ? WHERE id = ?`,
    ).run(sessionId, Date.now(), projectId);
  }
  // Which screen is open remains client-local. Only the normal-chat fallback
  // is shared so a project click has a deterministic destination.
  return session;
}

/** The General chat's row, when `projectId` is General. */
export function generalSessionFor(projectId: string): ProjectSessionRow | undefined {
  const general = generalChat();
  if (!general || general.projectId !== projectId) return undefined;
  return getProjectSession(projectId, general.sessionId);
}

/** Reports in General that nobody has looked at yet. */
export function unreadScheduledCount(projectId: string): number {
  const session = generalSessionFor(projectId);
  if (!session) return 0;
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM cron_deliveries
          WHERE project_id = ? AND session_id = ? AND read_at IS NULL`,
      )
      .get(projectId, session.session_id) as { count: number }
  ).count;
}

export function withProjectNavigation<T extends { id: string; profile?: string | null }>(
  project: T,
) {
  const general = generalSessionFor(project.id);
  return {
    ...project,
    // What the agent is called in a Bot's project; null = the install's name.
    bot_name: botName(project.profile ?? null),
    // True for the one project scheduled jobs report into. It keeps a single
    // chat, so the clients hide new chat and branch for it.
    general: Boolean(general),
    scheduled_session_id: general?.session_id ?? null,
    unread_scheduled_count: general ? unreadScheduledCount(project.id) : 0,
  };
}

export function projectEntrySession(projectId: string): ProjectSessionRow | null {
  return (
    (db
      .prepare(
        `SELECT * FROM project_sessions
          WHERE project_id = ? AND kind = 'chat' AND archived = 0
          ORDER BY last_active_at DESC, created_at DESC LIMIT 1`,
      )
      .get(projectId) as ProjectSessionRow | undefined) ?? null
  );
}

export function markScheduledRead(projectId: string): number {
  const session = generalSessionFor(projectId);
  if (!session) return 0;
  const result = db
    .prepare(
      `UPDATE cron_deliveries SET read_at = ?
        WHERE project_id = ? AND session_id = ? AND read_at IS NULL`,
    )
    .run(Date.now(), projectId, session.session_id);
  if (result.changes > 0) {
    publishChange("cron.read", { projectId, sessionId: session.session_id });
  }
  return result.changes;
}

export async function createRootSession(projectId: string, title = "New chat") {
  const project = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId);
  if (!project) return null;
  const sessionId = `${projectId}__s${randomUUID().slice(0, 8)}`;
  await createProjectSession(sessionId, title, hermesForProject(projectId));
  const now = Date.now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO project_sessions
        (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived)
       VALUES (?, ?, ?, NULL, ?, ?, 0)`,
    ).run(sessionId, projectId, title, now, now);
    db.prepare(
      `UPDATE projects
          SET session_id = ?, last_chat_session_id = ?, last_active_at = ?
        WHERE id = ?`,
    ).run(sessionId, sessionId, now, projectId);
  })();
  publishChange("session.changed", { projectId, sessionId });
  return getProjectSession(projectId, sessionId) ?? null;
}

export async function forkProjectSession(
  projectId: string,
  sourceSessionId: string,
  requestedTitle?: string,
) {
  const source = getProjectSession(projectId, sourceSessionId);
  if (!source) return null;
  const sessionId = `${projectId}__f${randomUUID().slice(0, 8)}`;
  const title = requestedTitle?.trim() || `${source.title} branch`;
  const forked = await hermesForProject(projectId).forkSession(sourceSessionId, {
    id: sessionId,
    title,
  });
  const actualId = typeof forked?.id === "string" && forked.id ? forked.id : sessionId;
  const now = Date.now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO project_sessions
        (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    ).run(actualId, projectId, title, sourceSessionId, now, now);
    db.prepare(
      `UPDATE projects
          SET session_id = ?, last_chat_session_id = ?, last_active_at = ?
        WHERE id = ?`,
    ).run(actualId, actualId, now, projectId);
  })();
  publishChange("session.changed", {
    projectId,
    sessionId: actualId,
    parentSessionId: sourceSessionId,
  });
  return getProjectSession(projectId, actualId) ?? null;
}

export async function renameSession(
  projectId: string,
  sessionId: string,
  title: string,
) {
  const session = getProjectSession(projectId, sessionId);
  const normalized = title.trim();
  if (!session || !normalized) return null;
  // The local title is the product contract. Older Hermes builds may not have
  // PATCH sessions; a missing mirror must not make a usable local tree fail.
  // A Bot Chat is renamed here only: upstream, its title *is* what makes it
  // the Bot's canonical chat, and the Desktop shares it. An imported chat
  // keeps the name it has wherever it came from.
  if (session.bot_chat !== 1 && session.imported !== 1) {
    try {
      await renameProjectSession(sessionId, normalized, hermesForProject(projectId));
    } catch (error) {
      if (!(error instanceof HermesApiError) || error.status !== 404) throw error;
    }
  }
  db.prepare(
    `UPDATE project_sessions SET title = ? WHERE project_id = ? AND session_id = ?`,
  ).run(normalized, projectId, sessionId);
  publishChange("session.changed", { projectId, sessionId });
  return getProjectSession(projectId, sessionId) ?? null;
}

export async function autoNameSession(
  projectId: string,
  sessionId: string,
  prompt: string,
) {
  const session = getProjectSession(projectId, sessionId);
  if (!session || session.title !== "New chat") return;
  const title = titleFromPrompt(prompt);
  if (!title) return;
  try {
    await renameSession(projectId, sessionId, title);
  } catch (error) {
    console.error(`[sessions] auto-title failed for ${sessionId}:`, error);
  }
}

export function sessionSubtree(projectId: string, sessionId: string): ProjectSessionRow[] {
  return db
    .prepare(
      `WITH RECURSIVE subtree(session_id) AS (
         SELECT session_id FROM project_sessions
          WHERE project_id = ? AND session_id = ?
         UNION ALL
         SELECT child.session_id FROM project_sessions child
          JOIN subtree parent ON child.parent_session_id = parent.session_id
          WHERE child.project_id = ?
       )
       SELECT ps.* FROM project_sessions ps JOIN subtree USING (session_id)`,
    )
    .all(projectId, sessionId, projectId) as ProjectSessionRow[];
}

/**
 * Deletes Hermes sessions, tolerating ones that are already gone: a retry
 * after a partially successful delete must be safe.
 */
export async function deleteUpstreamSessions(projectId: string, sessionIds: string[]) {
  const client = hermesForProject(projectId);
  for (const sessionId of sessionIds) {
    try {
      await client.deleteSession(sessionId);
    } catch (error) {
      if (!(error instanceof HermesApiError) || error.status !== 404) throw error;
    }
  }
}

/**
 * Moves the project's fallback pointers onto `replacementSessionId` when they
 * named one of `sessionIds`. Runs inside the caller's transaction.
 */
function repointProject(projectId: string, ids: Set<string>, replacementSessionId: string) {
  const project = db
    .prepare(`SELECT session_id, last_chat_session_id FROM projects WHERE id = ?`)
    .get(projectId) as
    | { session_id: string; last_chat_session_id: string | null }
    | undefined;
  if (
    !project ||
    !(ids.has(project.session_id) ||
      (project.last_chat_session_id && ids.has(project.last_chat_session_id)))
  ) {
    return;
  }
  const nextLegacy = ids.has(project.session_id) ? replacementSessionId : project.session_id;
  const nextLastChat =
    project.last_chat_session_id && !ids.has(project.last_chat_session_id)
      ? project.last_chat_session_id
      : replacementSessionId;
  db.prepare(
    `UPDATE projects SET session_id = ?, last_chat_session_id = ? WHERE id = ?`,
  ).run(nextLegacy, nextLastChat, projectId);
}

/**
 * Drops the local rows for a set of sessions in one project, and moves the
 * project's fallback pointers onto `replacementSessionId` if they named one of
 * them. `run_events` has no project_id and no foreign key, so it goes first.
 * A null replacement skips the pointer repair, for sessions no pointer can
 * name any more (retired ones were repointed when they were hidden).
 */
export function purgeLocalSessions(
  projectId: string,
  sessionIds: string[],
  replacementSessionId: string | null,
) {
  if (sessionIds.length === 0) return;
  const placeholders = sessionIds.map(() => "?").join(",");

  db.transaction(() => {
    db.prepare(
      `DELETE FROM run_events WHERE run_id IN (
         SELECT run_id FROM runs WHERE project_id = ? AND session_id IN (${placeholders})
       )`,
    ).run(projectId, ...sessionIds);
    db.prepare(
      `DELETE FROM runs WHERE project_id = ? AND session_id IN (${placeholders})`,
    ).run(projectId, ...sessionIds);
    db.prepare(
      `DELETE FROM queued_messages WHERE project_id = ? AND session_id IN (${placeholders})`,
    ).run(projectId, ...sessionIds);
    db.prepare(
      `DELETE FROM cron_deliveries WHERE project_id = ? AND session_id IN (${placeholders})`,
    ).run(projectId, ...sessionIds);
    db.prepare(
      `DELETE FROM project_sessions WHERE project_id = ? AND session_id IN (${placeholders})`,
    ).run(projectId, ...sessionIds);
    if (replacementSessionId) repointProject(projectId, new Set(sessionIds), replacementSessionId);
  })();
}

/**
 * Hides sessions from this app without touching Hermes: archived, and stamped
 * `retired_at` so they can be told apart from anything archived by hand and
 * deleted later on request. Their transcripts stay reachable from the CLI
 * and every other Hermes client.
 */
export function retireLocalSessions(
  projectId: string,
  sessionIds: string[],
  replacementSessionId: string,
) {
  if (sessionIds.length === 0) return;
  const placeholders = sessionIds.map(() => "?").join(",");
  db.transaction(() => {
    db.prepare(
      `UPDATE project_sessions SET archived = 1, retired_at = ?
        WHERE project_id = ? AND session_id IN (${placeholders})`,
    ).run(Date.now(), projectId, ...sessionIds);
    repointProject(projectId, new Set(sessionIds), replacementSessionId);
  })();
}

export async function deleteSessionSubtree(projectId: string, sessionId: string) {
  const all = listProjectSessions(projectId);
  const subtree = sessionSubtree(projectId, sessionId);
  if (subtree.length === 0) return { kind: "not_found" as const };
  // The Bot's forever-chat belongs to the Bot, not to this project — Desktop,
  // CLI and other Bots' messages all land in it.
  if (subtree.some((session) => session.bot_chat === 1)) {
    return { kind: "protected_bot_chat" as const };
  }
  const remainingChats = all.filter(
    (session) => session.kind === "chat" && !subtree.some((row) => row.session_id === session.session_id),
  );
  if (remainingChats.length === 0) return { kind: "last_session" as const };

  const ids = subtree.map((session) => session.session_id);
  // An imported chat leaves this app only; its branches were made here.
  const upstream = subtree
    .filter((session) => session.imported !== 1)
    .map((session) => session.session_id);
  await deleteUpstreamSessions(projectId, upstream.reverse());

  const replacement = remainingChats.sort((a, b) => b.last_active_at - a.last_active_at)[0];
  purgeLocalSessions(projectId, ids, replacement.session_id);

  publishChange("session.deleted", {
    projectId,
    sessionId,
    deletedSessionIds: ids,
    replacementSessionId: replacement.session_id,
  });
  return { kind: "deleted" as const, sessionId: replacement.session_id };
}

/** Hermes reports times as epoch seconds, epoch ms or ISO text, by build. */
export function epochMs(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return epochMs(numeric);
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export type AdoptResult =
  | { kind: "adopted"; session: ProjectSessionRow }
  | { kind: "general" }
  | { kind: "attached"; projectId: string; projectName: string };

/**
 * Brings a Hermes session that started somewhere else — the CLI, Telegram —
 * into this project as one of its chats.
 *
 * It is attached, not copied: the same session id, so a turn here continues
 * the same transcript. That is also why it can belong to one project only,
 * and why it is flagged `imported` — this app did not create it, so deleting
 * or renaming it here never reaches Hermes.
 */
export function adoptSession(projectId: string, session: HermesSession): AdoptResult {
  if (generalChat()?.projectId === projectId) return { kind: "general" };
  const owner = db
    .prepare(
      `SELECT s.project_id, p.name FROM project_sessions s
         JOIN projects p ON p.id = s.project_id
        WHERE s.session_id = ?`,
    )
    .get(session.id) as { project_id: string; name: string } | undefined;
  if (owner) return { kind: "attached", projectId: owner.project_id, projectName: owner.name };

  const now = Date.now();
  const created = epochMs(session.started_at) ?? now;
  const lastActive = epochMs(session.last_active) ?? epochMs(session.ended_at) ?? created;
  const title = session.title?.trim() || "Imported chat";
  db.transaction(() => {
    db.prepare(
      `INSERT INTO project_sessions
        (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived, imported)
       VALUES (?, ?, ?, NULL, ?, ?, 0, 1)`,
    ).run(session.id, projectId, title, created, lastActive);
    // So opening the project lands on the chat just brought in.
    db.prepare(`UPDATE projects SET last_chat_session_id = ?, last_active_at = ? WHERE id = ?`).run(
      session.id,
      now,
      projectId,
    );
  })();
  publishChange("session.changed", { projectId, sessionId: session.id });
  return { kind: "adopted", session: getProjectSession(projectId, session.id)! };
}
