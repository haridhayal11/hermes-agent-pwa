import { randomUUID } from "node:crypto";
import { publishChange } from "./api-changes";
import { db } from "./db";
import { hermes, HermesApiError } from "./hermes";
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
        ORDER BY created_at ASC`,
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
) {
  db.prepare(
    `INSERT INTO project_sessions
      (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived)
     VALUES (?, ?, ?, NULL, ?, ?, 0)`,
  ).run(sessionId, projectId, title, now, now);
  publishChange("session.changed", { projectId, sessionId });
}

export function selectProjectSession(projectId: string, sessionId: string) {
  const session = getProjectSession(projectId, sessionId);
  if (!session || session.archived === 1) return null;
  const now = Date.now();
  db.transaction(() => {
    db.prepare(
      `UPDATE projects SET session_id = ?, last_active_at = ? WHERE id = ?`,
    ).run(sessionId, now, projectId);
    db.prepare(
      `UPDATE project_sessions SET last_active_at = ? WHERE session_id = ?`,
    ).run(now, sessionId);
  })();
  publishChange("session.selected", { projectId, sessionId });
  return getProjectSession(projectId, sessionId) ?? null;
}

export async function createRootSession(projectId: string, title = "New chat") {
  const project = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId);
  if (!project) return null;
  const sessionId = `${projectId}__s${randomUUID().slice(0, 8)}`;
  await createProjectSession(sessionId, title);
  const now = Date.now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO project_sessions
        (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived)
       VALUES (?, ?, ?, NULL, ?, ?, 0)`,
    ).run(sessionId, projectId, title, now, now);
    db.prepare(
      `UPDATE projects SET session_id = ?, last_active_at = ? WHERE id = ?`,
    ).run(sessionId, now, projectId);
  })();
  publishChange("session.changed", { projectId, sessionId });
  publishChange("session.selected", { projectId, sessionId });
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
  const forked = await hermes.forkSession(sourceSessionId, { id: sessionId, title });
  const actualId = typeof forked?.id === "string" && forked.id ? forked.id : sessionId;
  const now = Date.now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO project_sessions
        (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    ).run(actualId, projectId, title, sourceSessionId, now, now);
    db.prepare(
      `UPDATE projects SET session_id = ?, last_active_at = ? WHERE id = ?`,
    ).run(actualId, now, projectId);
  })();
  publishChange("session.changed", {
    projectId,
    sessionId: actualId,
    parentSessionId: sourceSessionId,
  });
  publishChange("session.selected", { projectId, sessionId: actualId });
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
  try {
    await renameProjectSession(sessionId, normalized);
  } catch (error) {
    if (!(error instanceof HermesApiError) || error.status !== 404) throw error;
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

export async function deleteSessionSubtree(projectId: string, sessionId: string) {
  const all = listProjectSessions(projectId);
  const subtree = sessionSubtree(projectId, sessionId);
  if (subtree.length === 0) return { kind: "not_found" as const };
  if (subtree.length >= all.length) return { kind: "last_session" as const };

  for (const session of [...subtree].reverse()) {
    try {
      await hermes.deleteSession(session.session_id);
    } catch (error) {
      // A retry after a partially successful upstream delete is safe.
      if (!(error instanceof HermesApiError) || error.status !== 404) throw error;
    }
  }

  const ids = new Set(subtree.map((session) => session.session_id));
  const project = db
    .prepare(`SELECT session_id FROM projects WHERE id = ?`)
    .get(projectId) as { session_id: string } | undefined;
  const remaining = all
    .filter((session) => !ids.has(session.session_id))
    .sort((a, b) => b.last_active_at - a.last_active_at);
  const replacement = remaining[0];

  db.transaction(() => {
    const placeholders = subtree.map(() => "?").join(",");
    db.prepare(
      `DELETE FROM run_events WHERE run_id IN (
         SELECT run_id FROM runs WHERE session_id IN (${placeholders})
       )`,
    ).run(...subtree.map((session) => session.session_id));
    db.prepare(
      `DELETE FROM runs WHERE project_id = ? AND session_id IN (${placeholders})`,
    ).run(projectId, ...subtree.map((session) => session.session_id));
    db.prepare(
      `DELETE FROM queued_messages WHERE project_id = ? AND session_id IN (${placeholders})`,
    ).run(projectId, ...subtree.map((session) => session.session_id));
    db.prepare(
      `DELETE FROM cron_deliveries WHERE project_id = ? AND session_id IN (${placeholders})`,
    ).run(projectId, ...subtree.map((session) => session.session_id));
    db.prepare(`DELETE FROM project_sessions WHERE session_id = ?`).run(sessionId);
    if (project && ids.has(project.session_id)) {
      db.prepare(`UPDATE projects SET session_id = ? WHERE id = ?`).run(
        replacement.session_id,
        projectId,
      );
    }
  })();

  publishChange("session.deleted", {
    projectId,
    sessionId,
    deletedSessionIds: [...ids],
  });
  if (project && ids.has(project.session_id)) {
    publishChange("session.selected", {
      projectId,
      sessionId: replacement.session_id,
    });
  }
  return { kind: "deleted" as const, sessionId: replacement.session_id };
}
