"use client";

import { useState, type ReactNode } from "react";
import { NewProjectDialog } from "@/components/nav/NewProjectDialog";
import { ProjectRail, ProjectRailToggle } from "@/components/nav/ProjectRail";
import { HeaderMenu } from "@/components/nav/HeaderMenu";
import { SearchOverlay } from "@/components/nav/SearchOverlay";
import { RunStatusProvider } from "@/components/chat/RunStatusContext";
import { AppActionsProvider } from "@/components/AppActionsContext";
import { IconEdit } from "@/components/primitives/icons";
import type { Project } from "@/lib/chat-types";

/* One column, no sidebar. Switching projects is the rail hanging off the
 * header title; the drawer and the lg-and-up sidebar it mirrored are gone.
 *
 * h-dvh, and deliberately nothing cleverer. Sizing the shell from
 * visualViewport.height looks correct on paper and is wrong on iOS: when the
 * keyboard opens WebKit *pans* the visual viewport to reveal the caret rather
 * than resizing the layout viewport, so shrinking the shell to the visible
 * height leaves it ending mid-pan — the composer lands at the top of the
 * screen with dead space where the thread used to be. Left at h-dvh, the pan
 * does the right thing on its own and puts the composer just above the keys. */

export function AppShell({
  projects,
  activeId,
  title,
  activeProject,
  children,
}: {
  projects: Project[];
  activeId?: string;
  title: string;
  /** drives the header menu's "Edit project"; absent on the empty state */
  activeProject?: Project;
  children: ReactNode;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-page">
      <RunStatusProvider>
        <AppActionsProvider openSearch={() => setSearchOpen(true)}>
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
                  <HeaderMenu
                    project={activeProject}
                    onSearch={() => setSearchOpen(true)}
                  />
                </div>

                <div className="flex min-w-0 items-center justify-center">
                  <ProjectRailToggle
                    title={title}
                    open={railOpen}
                    onToggle={() => setRailOpen((current) => !current)}
                    interactive={projects.length > 0}
                  />
                </div>

                <button
                  type="button"
                  aria-label="New project"
                  onClick={() => setDialogOpen(true)}
                  className="tap-target flex size-9 items-center justify-center rounded-control text-ink-2
                  transition-colors duration-100 hover:bg-hover-2 hover:text-ink active:scale-[0.96]"
                >
                  <IconEdit size={17} />
                </button>
              </div>
            </header>

            <ProjectRail
              projects={projects}
              activeId={activeId}
              open={railOpen}
              onSelect={() => setRailOpen(false)}
              onNewProject={() => {
                setRailOpen(false);
                setDialogOpen(true);
              }}
            />

            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          </div>
        </AppActionsProvider>
      </RunStatusProvider>

      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
