"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import {
  IconEdit,
  IconSearch,
  IconSettings,
} from "@/components/primitives/icons";
import { ProjectSettingsSheet } from "./ProjectSettings";
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
}: {
  project?: Project;
  activeSessionId?: string;
  /** opens the cross-project search overlay, owned by the shell */
  onSearch?: () => void;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <Menu label="Menu" trigger={<IconSettings size={17} />}>
        {(close) => (
          <>
            {project && (
              <MenuItem
                icon={<IconEdit size={14} />}
                label="Edit project"
                onSelect={() => {
                  close();
                  setEditOpen(true);
                }}
              />
            )}
            {onSearch && (
              <MenuItem
                icon={<IconSearch size={14} />}
                label="Search"
                onSelect={() => {
                  close();
                  onSearch();
                }}
              />
            )}
            {(project || onSearch) && <MenuSeparator />}
            <MenuItem
              icon={<IconSettings size={14} />}
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
