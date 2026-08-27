"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconChevronRight,
  IconPlus,
} from "@/components/primitives/icons";
import type { Project, ProjectSession } from "@/lib/chat-types";

function SessionBranch({
  session,
  childrenByParent,
  activeSessionId,
  onSelect,
  onManage,
  depth = 0,
}: {
  session: ProjectSession;
  childrenByParent: Map<string | null, ProjectSession[]>;
  activeSessionId?: string;
  onSelect: (session: ProjectSession) => void;
  onManage: (session: ProjectSession) => void;
  depth?: number;
}) {
  const children = childrenByParent.get(session.session_id) ?? [];
  const active = session.session_id === activeSessionId;
  return (
    <li>
      <div
        className={`flex min-h-9 w-full items-center rounded-control text-label transition-colors ${
          active ? "bg-hover text-ink" : "text-ink-2 hover:bg-hover-2 hover:text-ink"
        }`}
        style={{ paddingLeft: `${20 + depth * 16}px` }}
      >
        <button
          type="button"
          onClick={() => onSelect(session)}
          aria-current={active ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
        >
          <span aria-hidden className="text-ink-3">
            {depth > 0 ? "└" : "•"}
          </span>
          <span className="min-w-0 flex-1 truncate">{session.title}</span>
        </button>
        {active && (
          <button
            type="button"
            onClick={() => onManage(session)}
            aria-label={`Manage ${session.title}`}
            className="grid size-8 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-hover"
          >
            ···
          </button>
        )}
      </div>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <SessionBranch
              key={child.session_id}
              session={child}
              childrenByParent={childrenByParent}
              activeSessionId={activeSessionId}
              onSelect={onSelect}
              onManage={onManage}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ProjectSidebar({
  projects,
  sessions,
  activeProjectId,
  activeSessionId,
  open,
  onClose,
  onNewProject,
}: {
  projects: Project[];
  sessions: ProjectSession[];
  activeProjectId?: string;
  activeSessionId?: string;
  open: boolean;
  onClose: () => void;
  onNewProject: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(activeProjectId ? [activeProjectId] : []),
  );
  const sessionsByProject = useMemo(() => {
    const map = new Map<string, ProjectSession[]>();
    for (const session of sessions) {
      const rows = map.get(session.project_id) ?? [];
      rows.push(session);
      map.set(session.project_id, rows);
    }
    return map;
  }, [sessions]);

  async function select(session: ProjectSession) {
    await fetch(
      `/api/projects/${session.project_id}/sessions/${session.session_id}/select`,
      { method: "POST" },
    );
    router.push(`/p/${session.project_id}/s/${session.session_id}`);
    onClose();
  }

  async function manage(session: ProjectSession) {
    const title = window.prompt(
      `Rename “${session.title}”. Leave blank to delete this session and its branches.`,
      session.title,
    );
    if (title === null) return;
    if (title.trim()) {
      const response = await fetch(
        `/api/projects/${session.project_id}/sessions/${session.session_id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim() }),
        },
      );
      if (response.ok) router.refresh();
      return;
    }
    if (!window.confirm("Delete this session and every branch below it?")) return;
    const response = await fetch(
      `/api/projects/${session.project_id}/sessions/${session.session_id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      window.alert(body.error ?? "The session could not be deleted.");
      return;
    }
    const body = (await response.json()) as { activeSessionId: string };
    router.replace(`/p/${session.project_id}/s/${body.activeSessionId}`);
    router.refresh();
  }

  const content = (
    <aside className="pt-safe pb-safe flex h-full w-[280px] shrink-0 flex-col border-r border-line bg-page">
      <div className="flex h-14 items-center justify-between px-4">
        <span className="text-ui font-semibold text-ink">Hermes</span>
        <button
          type="button"
          onClick={onNewProject}
          aria-label="New project"
          className="tap-target grid size-9 place-items-center rounded-control text-ink-2 hover:bg-hover"
        >
          <IconPlus size={17} />
        </button>
      </div>
      <nav aria-label="Projects and sessions" className="scroll-area min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <ul className="space-y-1">
          {projects.map((project) => {
            const projectSessions = sessionsByProject.get(project.id) ?? [];
            const roots = projectSessions.filter((session) => !session.parent_session_id);
            const children = new Map<string | null, ProjectSession[]>();
            for (const session of projectSessions) {
              const rows = children.get(session.parent_session_id) ?? [];
              rows.push(session);
              children.set(session.parent_session_id, rows);
            }
            const isOpen = expanded.has(project.id);
            return (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(project.id)) next.delete(project.id);
                      else next.add(project.id);
                      return next;
                    })
                  }
                  className={`flex min-h-10 w-full items-center gap-2 rounded-control px-2 text-left
                    text-label font-medium ${
                      project.id === activeProjectId ? "text-ink" : "text-ink-2 hover:bg-hover-2"
                    }`}
                  aria-expanded={isOpen}
                >
                  <span className="grid size-6 place-items-center">
                    {project.emoji ?? project.name.trim().charAt(0).toUpperCase() ?? "•"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span
                    aria-hidden
                    className="text-ink-3 transition-transform"
                    style={{ transform: isOpen ? "rotate(90deg)" : undefined }}
                  >
                    <IconChevronRight size={13} />
                  </span>
                </button>
                {isOpen && (
                  <ul className="mt-0.5">
                    {roots.map((session) => (
                      <SessionBranch
                        key={session.session_id}
                        session={session}
                        childrenByParent={children}
                        activeSessionId={activeSessionId}
                        onSelect={select}
                        onManage={manage}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-line px-3 pt-3 text-meta text-ink-3">
        Search, jobs and settings are available from the header menu.
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden h-full lg:block">{content}</div>
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={onClose}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative h-full shadow-overlay">{content}</div>
        </div>
      )}
    </>
  );
}
