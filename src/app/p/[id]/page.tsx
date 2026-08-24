import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { hermes } from "@/lib/hermes";
import { AppShell } from "@/components/AppShell";
import { ChatThread } from "./ChatThread";
import type { Project, ThreadMessage } from "@/lib/chat-types";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | Project
    | undefined;
  if (!project) notFound();

  const projects = db
    .prepare(`SELECT * FROM projects WHERE archived = 0 ORDER BY pinned DESC, last_active_at DESC`)
    .all() as Project[];

  let initialMessages: ThreadMessage[] = [];
  try {
    const res = await hermes.getMessages(project.session_id);
    initialMessages = res.data
      .filter(
        (m) =>
          typeof m.content === "string" &&
          m.content.length > 0 &&
          (m.role === "user" || m.role === "assistant" || m.role === "system"),
      )
      .map((m, i) => ({
        id: m.id ?? `msg_${i}`,
        role: m.role as ThreadMessage["role"],
        content: m.content as string,
      }));
  } catch {
    // Hermes unreachable or brand-new session — start empty, the composer
    // still works once the backend comes back.
  }

  return (
    <AppShell
      projects={projects}
      activeId={project.id}
      title={project.name}
      activeProject={project}
    >
      {/* Keyed on the session, not the project: useThread seeds `messages`
        * from initialMessages in a useState initialiser, so after /new the
        * router.refresh() would re-render this with an empty transcript and
        * the thread would keep showing the old one. A new session id is the
        * one case where the thread has to start over. */}
      <ChatThread
        key={project.session_id}
        project={project}
        initialMessages={initialMessages}
      />
    </AppShell>
  );
}
