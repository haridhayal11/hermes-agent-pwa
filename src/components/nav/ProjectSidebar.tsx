"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconBranch,
  IconChevronRight,
  IconClock,
  IconEdit,
  IconHome,
  IconMore,
  IconPin,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
} from "@/components/primitives/icons";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { RunDot, StatusDot } from "@/components/chat/RunDot";
import { useRunStatus } from "@/components/chat/RunStatusContext";
import { useActivity } from "@/components/ActivityContext";
import { useAppActions } from "@/components/AppActionsContext";
import { useKeyboardMod, useShortcuts } from "@/hooks/useShortcuts";
import { APP_NAME } from "@/lib/branding";
import { ProjectSettingsSheet } from "./ProjectSettings";
import type { Project, ProjectSession } from "@/lib/chat-types";
import { sessionsRecentFirst } from "@/lib/session-order";

/* The sidebar's own action rows — New project, Search, Settings. */
const sidebarRow =
  "flex h-9 w-full items-center gap-2.5 rounded-control px-2.5 text-left text-ui text-ink transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.98]";

function SessionBranch({
  session,
  childrenByParent,
  activeSessionId,
  onSelect,
  onRename,
  onDelete,
  generalSessionId,
  unreadScheduledCount,
  depth = 0,
}: {
  session: ProjectSession;
  childrenByParent: Map<string | null, ProjectSession[]>;
  activeSessionId?: string;
  onSelect: (session: ProjectSession) => void;
  /** resolves to an error message, or null on success */
  onRename: (session: ProjectSession, title: string) => Promise<string | null>;
  onDelete: (session: ProjectSession) => Promise<string | null>;
  /** General's one chat, where scheduled jobs report */
  generalSessionId: string | null;
  unreadScheduledCount: number;
  depth?: number;
}) {
  const children = childrenByParent.get(session.session_id) ?? [];
  const active = session.session_id === activeSessionId;
  const general = session.session_id === generalSessionId;
  // The open chat reports its own phase, instantly; every other chat reports
  // what the server knows about it.
  const elsewhere = useActivity().bySession.get(session.session_id);
  // The row itself turns into the rename field or the delete confirmation,
  // rather than a browser prompt() — which an installed app draws as a bare
  // system dialog, and which some browsers suppress altogether.
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [draft, setDraft] = useState(session.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("idle");
    setBusy(false);
    setError(null);
  }

  async function submitRename() {
    const title = draft.trim();
    if (!title || title === session.title) return reset();
    setBusy(true);
    setError(await onRename(session, title));
    setBusy(false);
    setMode((current) => (current === "rename" ? "idle" : current));
  }

  async function submitDelete() {
    setBusy(true);
    const failure = await onDelete(session);
    if (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <li>
      <div
        className={`flex min-h-9 w-full items-center rounded-control text-ui transition-colors duration-150 ${
          active ? "bg-hover-2 text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"
        }`}
        // indented to the project name above it, then a step per branch level
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {mode === "rename" ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1"
            onSubmit={(event) => {
              event.preventDefault();
              void submitRename();
            }}
          >
            <span aria-hidden className="flex size-6 shrink-0 items-center justify-center text-ink-3">
              {depth > 0 && <IconBranch size={14} />}
            </span>
            <input
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void submitRename()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setDraft(session.title);
                  reset();
                }
              }}
              aria-label="Chat title"
              className="h-7 min-w-0 flex-1 rounded-[8px] bg-page px-2 text-input text-ink
                shadow-[inset_0_0_0_1px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_1px_var(--ink-3)]
                [@media(pointer:fine)]:text-ui"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(session)}
            aria-current={active ? "page" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
          >
            <span aria-hidden className="flex size-6 shrink-0 items-center justify-center text-ink-3">
              {general ? (
                <IconClock size={14} />
              ) : depth > 0 ? (
                <IconBranch size={14} />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{session.title}</span>
            {active ? <RunDot /> : elsewhere && <StatusDot state={elsewhere.state} />}
            {general && unreadScheduledCount > 0 && (
              <span className="min-w-5 rounded-full bg-accent-tint px-1.5 text-center text-meta font-medium text-ink tabular-nums">
                {unreadScheduledCount}
              </span>
            )}
          </button>
        )}
        {active && mode === "idle" && (
          <Menu label={`Manage ${session.title}`} align="end" trigger={<IconMore size={16} />}>
            {(close) => (
              <>
                <MenuItem
                  icon={<IconEdit size={14} />}
                  label="Rename"
                  onSelect={() => {
                    close();
                    setDraft(session.title);
                    setMode("rename");
                  }}
                />
                {/* A Bot Chat belongs to its Bot — the desktop app, the CLI
                    and other Bots all write to it — so the server refuses.
                    General's chat is its only one, which it refuses too. */}
                {session.bot_chat !== 1 && !general && (
                  <MenuItem
                    icon={<IconTrash size={14} />}
                    label="Delete"
                    tone="danger"
                    onSelect={() => {
                      close();
                      setMode("delete");
                    }}
                  />
                )}
              </>
            )}
          </Menu>
        )}
      </div>
      {mode === "delete" && (
        <div
          role="alertdialog"
          aria-label="Delete chat"
          className="mx-2 mt-1 mb-1.5 rounded-control border border-line bg-surface p-2.5"
          style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
        >
          <p className="text-meta leading-snug text-ink-2">
            Delete this chat{children.length > 0 ? " and every branch below it" : ""}?
          </p>
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={reset}
              className="h-7 rounded-control px-2.5 text-label font-medium text-ink-2 hover:bg-hover hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              disabled={busy}
              onClick={() => void submitDelete()}
              className="h-7 rounded-control bg-red px-2.5 text-label font-medium text-white
                disabled:opacity-60"
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="mx-2 mb-1 px-1 text-meta text-red" role="alert">
          {error}
        </p>
      )}
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <SessionBranch
              key={child.session_id}
              session={child}
              childrenByParent={childrenByParent}
              activeSessionId={activeSessionId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              generalSessionId={generalSessionId}
              unreadScheduledCount={unreadScheduledCount}
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
  const { openSearch } = useAppActions();
  const { phase } = useRunStatus();
  const { byProject, activity } = useActivity();
  // shortcut hint on the Search row, only where there is a keyboard
  const mod = useKeyboardMod();
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(activeProjectId ? [activeProjectId] : []),
  );
  // Navigating into a project from anywhere else — search, a notification, a
  // shortcut — should open its branch here too, without collapsing the ones
  // the reader opened by hand. Adjusted during render, not in an effect, so
  // there is no frame where the active project is drawn shut.
  const [seenActive, setSeenActive] = useState(activeProjectId);
  if (activeProjectId !== seenActive) {
    setSeenActive(activeProjectId);
    if (activeProjectId && !expanded.has(activeProjectId)) {
      setExpanded(new Set(expanded).add(activeProjectId));
    }
  }
  const [editing, setEditing] = useState<Project | null>(null);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  // A short list is faster to scan than to search.
  const showFilter = projects.length > 6;

  const sessionsByProject = useMemo(() => {
    const map = new Map<string, ProjectSession[]>();
    for (const session of sessions) {
      const rows = map.get(session.project_id) ?? [];
      rows.push(session);
      map.set(session.project_id, rows);
    }
    for (const [projectId, rows] of map) {
      map.set(projectId, sessionsRecentFirst(rows));
    }
    return map;
  }, [sessions]);

  // `/` jumps to the filter. Both copies of the sidebar can be mounted (the
  // permanent column and the drawer), so focus whichever one is on screen.
  useShortcuts([
    {
      key: "/",
      when: showFilter,
      run: () => {
        const fields = document.querySelectorAll<HTMLInputElement>("[data-sidebar-filter]");
        Array.from(fields).find((field) => field.offsetParent !== null)?.focus();
      },
    },
  ]);

  function select(session: ProjectSession) {
    // The URL contains the durable ID, so duplicate display titles can never
    // influence which conversation wins a navigation race. The mounted page
    // records the project's fallback after this local navigation succeeds.
    router.push(`/p/${session.project_id}/s/${session.session_id}`);
    onClose();
  }

  async function openProject(project: Project) {
    const response = await fetch(`/api/projects/${project.id}/open`, { method: "POST" });
    if (!response.ok) return;
    const body = (await response.json()) as { sessionId: string };
    router.push(`/p/${project.id}/s/${body.sessionId}`);
    onClose();
  }

  async function togglePin(project: Project) {
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: project.pinned !== 1 }),
    });
    if (response.ok) router.refresh();
  }

  async function rename(session: ProjectSession, title: string) {
    const response = await fetch(
      `/api/projects/${session.project_id}/sessions/${session.session_id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    if (!response.ok) return "The chat could not be renamed.";
    router.refresh();
    return null;
  }

  async function remove(session: ProjectSession) {
    const response = await fetch(
      `/api/projects/${session.project_id}/sessions/${session.session_id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return body.error ?? "The chat could not be deleted.";
    }
    const body = (await response.json()) as { activeSessionId: string };
    router.replace(`/p/${session.project_id}/s/${body.activeSessionId}`);
    router.refresh();
    return null;
  }

  /* While filtering, the branch structure is dropped: a matching fork whose
   * parent doesn't match would otherwise be unreachable. A project whose own
   * name matches keeps all of its chats. */
  const visible = projects.flatMap((project) => {
    const projectSessions = sessionsByProject.get(project.id) ?? [];
    if (!needle) return [{ project, sessions: projectSessions, flat: false }];
    if (project.name.toLowerCase().includes(needle)) {
      return [{ project, sessions: projectSessions, flat: false }];
    }
    const hits = projectSessions.filter((s) => s.title.toLowerCase().includes(needle));
    return hits.length > 0 ? [{ project, sessions: hits, flat: true }] : [];
  });
  const anyPinned = visible.some(({ project }) => project.pinned === 1);

  const renderProject = ({
    project,
    sessions: projectSessions,
    flat,
  }: (typeof visible)[number]) => {
    const roots = flat
      ? projectSessions
      : projectSessions.filter((session) => !session.parent_session_id);
    const children = new Map<string | null, ProjectSession[]>();
    if (!flat) {
      for (const session of projectSessions) {
        const rows = children.get(session.parent_session_id) ?? [];
        rows.push(session);
        children.set(session.parent_session_id, rows);
      }
    }
    const isOpen = needle.length > 0 || expanded.has(project.id);
    const active = project.id === activeProjectId;
    return (
      <li key={project.id}>
        <div
          className={`group flex min-h-9 w-full items-center rounded-control text-ui transition-colors duration-150 ${
            // Open, the active chat row below carries the highlight; drawing
            // both would make two rows look selected.
            active
              ? `font-medium text-ink ${isOpen ? "hover:bg-hover" : "bg-hover-2"}`
              : "text-ink-2 hover:bg-hover hover:text-ink"
          }`}
        >
          <button
            type="button"
            onClick={() => void openProject(project)}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-1.5 text-left"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-field text-meta font-medium text-ink-2">
              {project.emoji ?? (project.name.trim().charAt(0).toUpperCase() || "•")}
            </span>
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            {/* Open, the chat rows below carry their own dots. */}
            {!isOpen &&
              (active && phase !== "idle" ? (
                <RunDot />
              ) : (
                byProject.has(project.id) && <StatusDot state={byProject.get(project.id)!} />
              ))}
            {project.unread_scheduled_count > 0 && !byProject.has(project.id) && (
              <span
                className="size-2 shrink-0 rounded-full bg-accent"
                aria-label="Unread scheduled reports"
              />
            )}
          </button>
          {/* Hidden until hover on a desktop, always there on touch — a phone
            * has no hover to reveal it with. */}
          <div className="opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:has-[[aria-expanded=true]]:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
            <Menu
              label={`Manage ${project.name}`}
              align="end"
              trigger={<IconMore size={16} className="text-ink-3" />}
            >
              {(close) => (
                <>
                  <MenuItem
                    icon={<IconPin size={14} />}
                    label={project.pinned === 1 ? "Unpin" : "Pin to top"}
                    onSelect={() => {
                      close();
                      void togglePin(project);
                    }}
                  />
                  <MenuItem
                    icon={<IconEdit size={14} />}
                    label="Edit project"
                    onSelect={() => {
                      close();
                      setEditing(project);
                    }}
                  />
                </>
              )}
            </Menu>
          </div>
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
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${project.name}`}
            aria-expanded={isOpen}
            disabled={needle.length > 0}
            className="grid size-8 shrink-0 place-items-center rounded-control text-ink-3 transition-colors duration-150 hover:text-ink"
          >
            <span
              aria-hidden
              className="transition-transform duration-150"
              style={{ transform: isOpen ? "rotate(90deg)" : undefined }}
            >
              <IconChevronRight size={14} />
            </span>
          </button>
        </div>
        {isOpen && (
          <ul className="mt-0.5 mb-1">
            {roots.length === 0 && (
              <li className="py-1.5 pl-10 text-label text-ink-3">No chats yet</li>
            )}
            {roots.map((session) => (
              <SessionBranch
                key={session.session_id}
                session={session}
                childrenByParent={children}
                activeSessionId={activeSessionId}
                onSelect={select}
                onRename={rename}
                onDelete={remove}
                generalSessionId={project.scheduled_session_id}
                unreadScheduledCount={project.unread_scheduled_count}
              />
            ))}
          </ul>
        )}
      </li>
    );
  };

  const sectionLabel = (text: string) => (
    <li className="px-2.5 pt-5 pb-1.5 text-label font-medium text-ink-3 first:pt-1">
      {text}
    </li>
  );

  const content = (
    <aside className="pt-safe pb-safe flex h-full w-[min(300px,84vw)] shrink-0 flex-col bg-canvas lg:w-[272px]">
      <div className="flex h-13 items-center px-4">
        <span className="text-title font-semibold text-ink">{APP_NAME}</span>
      </div>
      {/* The two things you start from, as rows at the top — the category's
        * arrangement — rather than an icon in the header and a button at the
        * foot. */}
      <div className="flex flex-col gap-px px-2 pb-2">
        {/* Home carries the same count as the app icon: what is waiting on
          * you across every project. */}
        <button
          type="button"
          onClick={() => {
            onClose();
            router.push("/");
          }}
          aria-current={activeProjectId ? undefined : "page"}
          className={`${sidebarRow} ${activeProjectId ? "" : "bg-hover-2"}`}
        >
          <IconHome size={18} className="text-ink-2" />
          <span className="flex-1">Home</span>
          {(activity?.badge ?? 0) > 0 && (
            <span className="min-w-5 rounded-full bg-accent-tint px-1.5 text-center text-meta font-medium text-ink tabular-nums">
              {activity!.badge}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onNewProject}
          className={sidebarRow}
        >
          <IconPlus size={18} className="text-ink-2" />
          <span className="flex-1">New project</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            openSearch();
          }}
          className={sidebarRow}
        >
          <IconSearch size={18} className="text-ink-2" />
          <span className="flex-1">Search</span>
          {mod && <kbd className="font-sans text-meta text-ink-3 tabular-nums">{mod}K</kbd>}
        </button>
      </div>
      {showFilter && (
        <div className="px-2 pb-2">
          <input
            data-sidebar-filter
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                event.currentTarget.blur();
              }
            }}
            placeholder="Filter projects and chats"
            aria-label="Filter projects and chats"
            // 16px on touch, or iOS zooms the viewport on focus
            className="h-9 w-full rounded-control bg-transparent px-3 text-input text-ink
              shadow-[inset_0_0_0_1px_var(--line-strong)] outline-none placeholder:text-ink-3
              focus:shadow-[inset_0_0_0_1px_var(--ink-3)] [@media(pointer:fine)]:text-ui"
          />
        </div>
      )}
      <nav aria-label="Projects and sessions" className="scroll-area min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <ul className="space-y-0.5">
          {anyPinned && !needle && sectionLabel("Pinned")}
          {visible.filter(({ project }) => anyPinned && !needle && project.pinned === 1).map(renderProject)}
          {anyPinned &&
            !needle &&
            visible.some(({ project }) => project.pinned !== 1) &&
            sectionLabel("Projects")}
          {visible.filter(({ project }) => !(anyPinned && !needle && project.pinned === 1)).map(renderProject)}
        </ul>
        {needle && visible.length === 0 && (
          <p className="px-2 py-6 text-center text-label text-ink-3">
            Nothing matches &ldquo;{query.trim()}&rdquo;.
          </p>
        )}
      </nav>
      <div className="px-2 py-2">
        <button
          type="button"
          onClick={() => {
            onClose();
            router.push("/settings");
          }}
          className={sidebarRow}
        >
          <IconSettings size={18} className="text-ink-2" />
          <span className="flex-1">Settings</span>
        </button>
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
            className="absolute inset-0 bg-scrim"
            style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
          />
          <div
            className="relative h-full shadow-overlay"
            style={{ animation: "panel-in-right var(--duration-medium) var(--ease-drawer) both" }}
          >
            {content}
          </div>
        </div>
      )}
      {editing && (
        <ProjectSettingsSheet
          project={editing}
          sessionId={editing.id === activeProjectId ? activeSessionId : undefined}
          open
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
