import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { messagesForSession } from "@/lib/project-messages";
import { ChatThread } from "../../ChatThread";
import type {
  Project,
  ProjectSession,
  ThreadMessage,
} from "@/lib/chat-types";
import { withProjectNavigation } from "@/lib/project-sessions";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  const storedProject = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | Omit<Project, "scheduled_session_id" | "unread_scheduled_count">
    | undefined;
  const session = db
    .prepare(
      `SELECT * FROM project_sessions WHERE project_id = ? AND session_id = ? AND archived = 0`,
    )
    .get(id, sessionId) as ProjectSession | undefined;
  if (!storedProject || !session) notFound();
  const project = withProjectNavigation(storedProject) as Project;

  const projects = (db
    .prepare(
      `SELECT * FROM projects WHERE archived = 0
       ORDER BY pinned DESC, last_active_at DESC`,
    )
    .all() as Omit<Project, "scheduled_session_id" | "unread_scheduled_count">[])
    .map(withProjectNavigation) as Project[];
  const sessions = db
    .prepare(
      `SELECT ps.* FROM project_sessions ps
       JOIN projects p ON p.id = ps.project_id
       WHERE ps.archived = 0 AND p.archived = 0
       ORDER BY ps.last_active_at DESC, ps.created_at DESC, ps.session_id ASC`,
    )
    .all() as ProjectSession[];

  let initialMessages: ThreadMessage[] = [];
  try {
    const messages = (await messagesForSession(id, sessionId)) ?? [];
    initialMessages = (messages as {
      id?: string;
      role?: string;
      content?: unknown;
      cron?: ThreadMessage["cron"];
    }[])
      .filter(
        (message) =>
          typeof message.content === "string" &&
          message.content.length > 0 &&
          ["user", "assistant", "system", "cron"].includes(message.role ?? ""),
      )
      .map((message, index) => ({
        id: message.id ?? `msg_${index}`,
        role: message.role as ThreadMessage["role"],
        content: message.content as string,
        ...(message.cron ? { cron: message.cron } : {}),
      }));
  } catch {
    // Cached/live streaming UI can recover when Hermes comes back.
  }

  return (
    <AppShell
      projects={projects}
      sessions={sessions}
      activeId={project.id}
      activeSessionId={session.session_id}
      title={session.title}
      activeProject={project}
    >
      <ChatThread
        key={session.session_id}
        project={project}
        session={session}
        initialMessages={initialMessages}
      />
    </AppShell>
  );
}
