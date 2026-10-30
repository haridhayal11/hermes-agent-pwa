"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import {
  IconDiff,
  IconEdit,
  IconFolder,
  IconImport,
  IconKeyboard,
  IconMore,
  IconSearch,
  IconSettings,
  IconShare,
} from "@/components/primitives/icons";
import type { ProjectPanel } from "@/components/AppActionsContext";
import { ProjectSettingsSheet } from "./ProjectSettings";
import { useKeyboardMod } from "@/hooks/useShortcuts";
import type { Project } from "@/lib/chat-types";

/* The header's left slot. It was a gear that opened the project edit form
 * directly, which conflated two different things — this project, and the app.
 * Now the gear is a menu and the app-wide half has a page of its own.
 *
 * `project` is absent on the empty state. The menu still renders there: it is
 * the only route to /settings before a project exists. */

export function HeaderMenu({
  project,
  activeSessionId,
  onSearch,
  onShortcuts,
  onPanel,
  onExport,
}: {
  project?: Project;
  activeSessionId?: string;
  /** opens the cross-project search overlay, owned by the shell */
  onSearch?: () => void;
  /** opens the keyboard cheatsheet — only offered where there is a keyboard */
  onShortcuts?: () => void;
  /** opens one of the open project's panels, owned by the shell */
  onPanel?: (panel: ProjectPanel) => void;
  /** exports the open chat as Markdown */
  onExport?: () => void;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const mod = useKeyboardMod();

  return (
    <>
      <Menu label="Menu" align="end" triggerSize="lg" trigger={<IconMore size={20} />}>
        {(close) => (
          <>
            {project && (
              <MenuItem
                icon={<IconEdit size={16} />}
                label="Edit project"
                onSelect={() => {
                  close();
                  setEditOpen(true);
                }}
              />
            )}
            {project && onPanel && (
              <MenuItem
                icon={<IconFolder size={16} />}
                label="Files"
                onSelect={() => {
                  close();
                  onPanel({ kind: "files" });
                }}
              />
            )}
            {/* Only with a working directory: there is nothing else to diff. */}
            {project?.cwd && onPanel && (
              <MenuItem
                icon={<IconDiff size={16} />}
                label="What changed"
                onSelect={() => {
                  close();
                  onPanel({ kind: "diff" });
                }}
              />
            )}
            {project && onExport && (
              <MenuItem
                icon={<IconShare size={16} />}
                label="Export chat"
                onSelect={() => {
                  close();
                  onExport();
                }}
              />
            )}
            {/* General keeps a single chat; there is nowhere to bring one in. */}
            {project && !project.general && onPanel && (
              <MenuItem
                icon={<IconImport size={16} />}
                label="Bring in a chat…"
                onSelect={() => {
                  close();
                  onPanel({ kind: "import" });
                }}
              />
            )}
            {project && <MenuSeparator />}
            {onSearch && (
              <MenuItem
                icon={<IconSearch size={16} />}
                label="Search"
                hint={mod ? `${mod}K` : undefined}
                onSelect={() => {
                  close();
                  onSearch();
                }}
              />
            )}
            {onShortcuts && mod && (
              <MenuItem
                icon={<IconKeyboard size={16} />}
                label="Keyboard shortcuts"
                hint="?"
                onSelect={() => {
                  close();
                  onShortcuts();
                }}
              />
            )}
            {(project || onSearch) && <MenuSeparator />}
            <MenuItem
              icon={<IconSettings size={16} />}
              label="Settings"
              onSelect={() => {
                close();
                router.push("/settings");
              }}
            />
          </>
        )}
      </Menu>

      {project && (
        <ProjectSettingsSheet
          project={project}
          sessionId={activeSessionId}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
