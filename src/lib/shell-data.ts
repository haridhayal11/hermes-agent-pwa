import { db } from "./db";
import { withProjectNavigation } from "./project-sessions";
import type { Project, ProjectSession } from "./chat-types";

/* What every AppShell page renders the sidebar from. Server only. */

type StoredProject = Omit<Project, "scheduled_session_id" | "unread_scheduled_count">;

export function loadProject(id: string): Project | null {
  const stored = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | StoredProject
    | undefined;
  return stored ? (withProjectNavigation(stored) as Project) : null;
}

export function loadShellData(): { projects: Project[]; sessions: ProjectSession[] } {
  const projects = (
    db
      .prepare(
        `SELECT * FROM projects WHERE archived = 0
          ORDER BY pinned DESC, last_active_at DESC`,
      )
      .all() as StoredProject[]
  ).map(withProjectNavigation) as Project[];
  const sessions = db
    .prepare(
      `SELECT ps.* FROM project_sessions ps
         JOIN projects p ON p.id = ps.project_id
        WHERE ps.archived = 0 AND p.archived = 0
        ORDER BY ps.last_active_at DESC, ps.created_at DESC, ps.session_id ASC`,
    )
    .all() as ProjectSession[];
  return { projects, sessions };
}
