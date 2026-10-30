"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NewProjectDialog } from "@/components/nav/NewProjectDialog";
import { NewChatDialog } from "@/components/nav/NewChatDialog";
import { ProjectSidebar } from "@/components/nav/ProjectSidebar";
import { HeaderMenu } from "@/components/nav/HeaderMenu";
import { NotificationsButton } from "@/components/nav/NotificationsButton";
import { SearchOverlay } from "@/components/nav/SearchOverlay";
import { ShortcutsSheet } from "@/components/nav/ShortcutsSheet";
import { FilesSheet } from "@/components/nav/FilesSheet";
import { DiffSheet } from "@/components/nav/DiffSheet";
import { ImportSessionDialog } from "@/components/nav/ImportSessionDialog";
import { Toast } from "@/components/ui/Toast";
import { exportThread } from "@/lib/export-thread";
import { RunStatusProvider } from "@/components/chat/RunStatusContext";
import { RunDot } from "@/components/chat/RunDot";
import { useShortcuts } from "@/hooks/useShortcuts";
import { sessionsRecentFirst } from "@/lib/session-order";
import { AppActionsProvider, type ProjectPanel } from "@/components/AppActionsContext";
import { useActivity } from "@/components/ActivityContext";
import { IconEdit, IconMenu } from "@/components/primitives/icons";
import type { Project, ProjectSession } from "@/lib/chat-types";

/* Projects and their chats live in ProjectSidebar: a permanent column from
 * `lg` up, a drawer behind the header's menu button below that.
 *
 * h-app rather than visualViewport.height, and the distinction is the whole
 * point. When the keyboard opens WebKit *pans* the visual viewport to reveal
 * the caret rather than resizing the layout viewport, so shrinking the shell
 * to the visible height leaves it ending mid-pan — the composer lands at the
 * top of the screen with dead space where the thread used to be. Sized off the
 * layout viewport, the pan does the right thing on its own and puts the
 * composer just above the keys.
 *
 * It was h-dvh until iOS 26, which overreports the dynamic viewport in an
 * installed web app: the shell ended taller than the screen, and since it is
 * also overflow-hidden the composer sat below the bottom edge with no way to
 * reach it. h-app is that same layout viewport, measured — see globals.css and
 * the APP_HEIGHT script in layout.tsx. */

export function AppShell({
  projects,
  sessions = [],
  activeId,
  activeSessionId,
  title,
  activeProject,
  children,
}: {
  projects: Project[];
  sessions?: ProjectSession[];
  activeId?: string;
  activeSessionId?: string;
  title: string;
  /** drives the header menu's "Edit project"; absent on the empty state */
  activeProject?: Project;
  children: ReactNode;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** Files, What changed, Bring in a chat — opened from the header menu or a
   *  slash command; one at a time, always about the open project */
  const [panel, setPanel] = useState<ProjectPanel | null>(null);
  /** a shell-level failure with nowhere else to go — an export from the menu */
  const [shellError, setShellError] = useState<string | null>(null);
  const router = useRouter();
  const { refresh: refreshActivity } = useActivity();

  // The current project's chats in sidebar order, for ⌥↑ / ⌥↓.
  const siblings = useMemo(
    () => sessionsRecentFirst(sessions.filter((s) => s.project_id === activeId)),
    [sessions, activeId],
  );
  const activeSession = siblings.find((s) => s.session_id === activeSessionId);
  const sessionTitle = activeSession?.title ?? title;

  function stepSession(delta: 1 | -1) {
    const at = siblings.findIndex((s) => s.session_id === activeSessionId);
    const next = siblings[at + delta];
    if (at === -1 || !next) return;
    router.push(`/p/${next.project_id}/s/${next.session_id}`);
  }

  useShortcuts([
    { key: "k", mod: true, run: () => setSearchOpen(true) },
    {
      key: "o",
      mod: true,
      shift: true,
      // General keeps a single chat; scheduled jobs report into it.
      when: Boolean(activeProject) && !activeProject?.general,
      run: () => setNewChatOpen(true),
    },
    { key: "ArrowUp", alt: true, when: siblings.length > 1, run: () => stepSession(-1) },
    { key: "ArrowDown", alt: true, when: siblings.length > 1, run: () => stepSession(1) },
    { key: "?", run: () => setShortcutsOpen(true) },
  ]);

  // Record the normal-chat fallback without making navigation shared across
  // devices. Scheduled selections deliberately leave that fallback alone.
  useEffect(() => {
    if (!activeProject || !activeSessionId) return;
    void fetch(
      `/api/projects/${activeProject.id}/sessions/${activeSessionId}/select`,
      { method: "POST" },
    );
  }, [activeProject, activeSessionId]);

  // Shared data changes refresh the shell, but another device's navigation
  // must never replace this device's route. Deletion is the exception only
  // when the session visible here no longer exists.
  useEffect(() => {
    const source = new EventSource("/api/changes");
    source.addEventListener("change", (raw) => {
      try {
        const event = JSON.parse((raw as MessageEvent).data) as {
          type?: string;
          payload?: {
            projectId?: string;
            deletedSessionIds?: string[];
            replacementSessionId?: string;
          };
        };
        // Run transitions only move the activity dots and the badge. They
        // arrive several times per run, and a server re-render of the whole
        // shell for each one would be churn mid-stream — so this is checked
        // before the ".changed" rule below, which would otherwise catch it.
        if (event.type === "run.changed") {
          refreshActivity();
          return;
        }
        if (
          event.type?.startsWith("cron.") ||
          event.type?.startsWith("session.") ||
          event.type?.startsWith("project.")
        ) {
          refreshActivity();
        }
        const payload = event.payload;
        const deletedSessionIds = payload?.deletedSessionIds;
        const replacementSessionId = payload?.replacementSessionId;
        if (
          event.type === "session.deleted" &&
          payload?.projectId === activeId &&
          activeSessionId &&
          deletedSessionIds?.includes(activeSessionId) &&
          replacementSessionId
        ) {
          router.replace(`/p/${activeId}/s/${replacementSessionId}`);
          return;
        }
        if (
          event.type === "sync.reset" ||
          event.type === "session.deleted" ||
          event.type?.startsWith("cron.") ||
          event.type?.endsWith(".changed")
        ) {
          router.refresh();
        }
      } catch {
        // Ignore malformed invalidations; normal navigation still refreshes.
      }
    });
    return () => source.close();
  }, [activeId, activeSessionId, router, refreshActivity]);

  return (
    <div className="h-app flex w-full overflow-hidden bg-page">
      <RunStatusProvider>
        <AppActionsProvider openSearch={() => setSearchOpen(true)} openPanel={setPanel}>
          <ProjectSidebar
            projects={projects}
            sessions={sessions}
            activeProjectId={activeId}
            activeSessionId={activeSessionId}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onNewProject={() => {
              setSidebarOpen(false);
              setDialogOpen(true);
            }}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            {/* The inset is padding on the bar, and the 52px row is a child of it.
             * Putting both on one element (a fixed height + padding-top: 59px)
             * collapses the content box to zero and the title spills out over the
             * thread — which is exactly what it did. */}
            <header className="pt-safe z-30 shrink-0 bg-page">
              {/* Three columns rather than a flex row, so the title stays
               * optically centred on the bar and doesn't shift with the width of
               * whatever sits either side of it. */}
              <div className="grid h-13 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 px-1.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-2">
                <div className="flex size-10 items-center justify-center lg:hidden">
                  <button
                    type="button"
                    aria-label="Open projects and sessions"
                    onClick={() => setSidebarOpen(true)}
                    className="tap-target grid size-10 place-items-center rounded-control text-ink-2 transition-[color,background-color,transform] duration-150 hover:bg-hover hover:text-ink active:scale-[0.96]"
                  >
                    <IconMenu size={20} />
                  </button>
                </div>

                {/* Project first, then the chat: on a phone the project is the
                  * thing you lose track of. The chat name gives way first. */}
                {/* Centred on a phone, the way a native title bar sits; at the
                  * left on a desktop, where the sidebar is already the anchor. */}
                <div className="flex min-w-0 items-center justify-center gap-2 px-3 lg:justify-start">
                  <RunDot />
                  {/* A project's first chat is named after it; saying it twice is noise.
                    * With both names, a phone stacks them — project over chat —
                    * rather than cutting two halves off side by side; from `sm`
                    * there is room to set them on one line. */}
                  {activeProject && sessionTitle && sessionTitle !== activeProject.name ? (
                    <h1 className="flex min-w-0 flex-col items-center font-semibold text-ink sm:flex-row sm:items-baseline sm:gap-1.5">
                      <span className="max-w-full min-w-0 truncate text-ui leading-tight sm:max-w-[60%] sm:text-title">
                        {activeProject.name}
                      </span>
                      <span aria-hidden className="hidden text-title text-ink-3 sm:inline">·</span>
                      <span className="max-w-full min-w-0 shrink-[4] truncate text-meta leading-tight font-medium text-ink-2 sm:text-title">
                        {sessionTitle}
                      </span>
                    </h1>
                  ) : (
                    <h1 className="flex min-w-0 items-baseline text-title font-semibold text-ink">
                      <span className="truncate">{activeProject?.name ?? title}</span>
                    </h1>
                  )}
                </div>

                <div className="flex items-center">
                  <NotificationsButton />
                  <HeaderMenu
                    project={activeProject}
                    activeSessionId={activeSessionId}
                    onSearch={() => setSearchOpen(true)}
                    onShortcuts={() => setShortcutsOpen(true)}
                    onPanel={setPanel}
                    onExport={
                      activeProject && activeSessionId
                        ? async () => {
                            const failure = await exportThread(activeProject.id, activeSessionId);
                            setShellError(failure);
                          }
                        : undefined
                    }
                  />
                  {!activeProject?.general && (
                  <button
                    type="button"
                    aria-label={activeProject ? "New chat" : "New project"}
                    onClick={() =>
                      activeProject ? setNewChatOpen(true) : setDialogOpen(true)
                    }
                    className="tap-target flex size-10 items-center justify-center rounded-control text-ink-2
                    transition-[color,background-color,transform] duration-150 hover:bg-hover hover:text-ink active:scale-[0.96]"
                  >
                    <IconEdit size={20} />
                  </button>
                  )}
                </div>
              </div>
            </header>

            {shellError && (
              <div className="px-safe pointer-events-none z-30 mx-auto w-full max-w-3xl pt-1">
                <Toast message={shellError} tone="error" onDismiss={() => setShellError(null)} />
              </div>
            )}
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          </div>
        </AppActionsProvider>
      </RunStatusProvider>

      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      {activeProject && (
        <NewChatDialog
          projectId={activeProject.id}
          open={newChatOpen}
          onClose={() => setNewChatOpen(false)}
        />
      )}
      {activeProject && (
        <>
          <FilesSheet
            projectId={activeProject.id}
            open={panel?.kind === "files"}
            onClose={() => setPanel(null)}
          />
          <DiffSheet
            projectId={activeProject.id}
            open={panel?.kind === "diff"}
            onClose={() => setPanel(null)}
          />
          <ImportSessionDialog
            projectId={activeProject.id}
            open={panel?.kind === "import"}
            query={panel?.kind === "import" ? panel.query : undefined}
            resume={panel?.kind === "import" ? panel.resume : undefined}
            onClose={() => setPanel(null)}
          />
        </>
      )}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
