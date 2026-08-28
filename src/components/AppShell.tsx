"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NewProjectDialog } from "@/components/nav/NewProjectDialog";
import { NewChatDialog } from "@/components/nav/NewChatDialog";
import { ProjectSidebar } from "@/components/nav/ProjectSidebar";
import { HeaderMenu } from "@/components/nav/HeaderMenu";
import { SearchOverlay } from "@/components/nav/SearchOverlay";
import { RunStatusProvider } from "@/components/chat/RunStatusContext";
import { AppActionsProvider } from "@/components/AppActionsContext";
import { IconEdit, IconMenu } from "@/components/primitives/icons";
import type { Project, ProjectSession } from "@/lib/chat-types";

/* One column, no sidebar. Switching projects is the rail hanging off the
 * header title; the drawer and the lg-and-up sidebar it mirrored are gone.
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
  const router = useRouter();

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
  }, [activeId, activeSessionId, router]);

  return (
    <div className="h-app flex w-full overflow-hidden bg-page">
      <RunStatusProvider>
        <AppActionsProvider openSearch={() => setSearchOpen(true)}>
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
            {/* The inset is padding on the bar, and the 56px row is a child of it.
             * Putting both on one element (a fixed height + padding-top: 59px)
             * collapses the content box to zero and the title spills out over the
             * thread — which is exactly what it did. */}
            <header className="pt-safe z-30 shrink-0 bg-page">
              {/* Three columns rather than a flex row, so the title stays
               * optically centred on the bar and doesn't shift with the width of
               * whatever sits either side of it. */}
              <div className="grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 px-1.5">
                <div className="flex size-9 items-center justify-center">
                  <button
                    type="button"
                    aria-label="Open projects and sessions"
                    onClick={() => setSidebarOpen(true)}
                    className="tap-target grid size-9 place-items-center rounded-control text-ink-2 hover:bg-hover-2 lg:invisible"
                  >
                    <IconMenu size={17} />
                  </button>
                </div>

                <div className="flex min-w-0 items-center justify-center">
                  <h1 className="max-w-full truncate px-3 text-ui font-semibold text-ink">
                    {title}
                  </h1>
                </div>

                <div className="flex items-center">
                  <HeaderMenu
                    project={activeProject}
                    activeSessionId={activeSessionId}
                    onSearch={() => setSearchOpen(true)}
                  />
                  <button
                    type="button"
                    aria-label={activeProject ? "New chat" : "New project"}
                    onClick={() =>
                      activeProject ? setNewChatOpen(true) : setDialogOpen(true)
                    }
                    className="tap-target flex size-9 items-center justify-center rounded-control text-ink-2
                    transition-colors duration-100 hover:bg-hover-2 hover:text-ink active:scale-[0.96]"
                  >
                    <IconEdit size={17} />
                  </button>
                </div>
              </div>
            </header>

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
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
