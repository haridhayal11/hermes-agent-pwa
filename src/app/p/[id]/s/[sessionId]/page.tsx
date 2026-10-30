import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { messagesForSession } from "@/lib/project-messages";
import { ChatThread } from "../../ChatThread";
import type { ProjectSession, ThreadMessage } from "@/lib/chat-types";
import { toThreadMessages, type RawThreadMessage } from "@/lib/thread-messages";
import { loadProject, loadShellData } from "@/lib/shell-data";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  const project = loadProject(id);
  const session = db
    .prepare(
      `SELECT * FROM project_sessions WHERE project_id = ? AND session_id = ? AND archived = 0`,
    )
    .get(id, sessionId) as ProjectSession | undefined;
  if (!project || !session) notFound();
  const { projects, sessions } = loadShellData();

  let initialMessages: ThreadMessage[] = [];
  try {
    const messages = (await messagesForSession(id, sessionId)) ?? [];
    initialMessages = toThreadMessages(messages as RawThreadMessage[]);
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
