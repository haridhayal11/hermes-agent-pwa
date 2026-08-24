"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { IconChevronDown, IconPlus } from "@/components/primitives/icons";
import { useRunStatus } from "@/components/chat/RunStatusContext";
import { useAgentName } from "@/components/AgentNameContext";
import type { Project } from "@/lib/chat-types";

/* The project switcher: a horizontal strip of tiles that lives under the
 * header, collapsed by default and pulled down by tapping the project name.
 *
 * Collapsed is the resting state on purpose. A permanently visible rail costs
 * ~130px of a phone screen forever to answer a question — "which project am I
 * in" — that the header title already answers. It is only worth that space in
 * the moment you want to switch.
 *
 * This replaced the sidebar outright, so the rail is now the only way to
 * change project. */

function Tile({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`grid size-16 shrink-0 place-items-center rounded-[20px]
        transition-[background-color,box-shadow,transform] duration-150
        group-active/tile:scale-[0.94] ${
          active ? "bg-surface shadow-raised" : "bg-canvas shadow-hairline"
        }`}
    >
      {children}
    </span>
  );
}

/* The header stack: the agent's name on top, the project it is currently
 * pointed at underneath, and the whole block is the rail's disclosure control.
 * Reads as "<app name>, working on <project>" — the agent is the constant and the
 * project is the thing you change. */
export function ProjectRailToggle({
  title,
  open,
  onToggle,
  interactive,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** false when there are no projects to switch between — renders plain text */
  interactive: boolean;
}) {
  const { phase } = useRunStatus();
  const agentName = useAgentName();

  const tone =
    phase === "running"
      ? { color: "var(--accent)", label: "Running" }
      : phase === "waiting_for_approval"
        ? { color: "var(--orange)", label: "Waiting for approval" }
        : { color: "var(--ink-3)", label: "Idle" };

  const agent = (
    <span className="flex items-center gap-1.5">
      <span
        role="status"
        aria-label={tone.label}
        className="size-2 shrink-0 rounded-full"
        style={{
          background: tone.color,
          // the only at-a-glance signal of an active run once the thread has
          // scrolled past the status line
          animation:
            phase === "idle" ? undefined : "pulse-dot 1.4s var(--ease-smooth-out) infinite",
        }}
      />
      <span className="text-ui leading-tight font-semibold text-ink">{agentName}</span>
    </span>
  );

  if (!interactive) {
    return <h1 className="flex min-w-0 flex-col items-center px-2.5">{agent}</h1>;
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${agentName} — ${title}. Switch project`}
      className="flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-3 py-1
        transition-colors duration-100 hover:bg-hover-2 active:scale-[0.97]"
    >
      {agent}
      <span className="flex min-w-0 max-w-full items-center gap-0.5">
        <span className="min-w-0 truncate text-label leading-tight font-medium text-ink-3">
          {title}
        </span>
        <span
          aria-hidden
          className="shrink-0 text-ink-3 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <IconChevronDown size={12} />
        </span>
      </span>
    </button>
  );
}

export function ProjectRail({
  projects,
  activeId,
  open,
  onSelect,
  onNewProject,
}: {
  projects: Project[];
  activeId?: string;
  open: boolean;
  /** fires on any tile tap — the rail closes itself once you've chosen */
  onSelect: () => void;
  onNewProject: () => void;
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Centre the current project whenever the rail opens. With more projects
  // than fit, it is otherwise off-screen and the rail looks like it is
  // showing an unrelated set.
  useEffect(() => {
    if (!open) return;
    const el = activeRef.current;
    if (!el) return;
    // block: "nearest" so this never scrolls the thread vertically
    el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [open, activeId]);

  if (projects.length === 0) return null;

  return (
    <div
      // the 0fr/1fr grid collapse, same as the tool and thinking disclosures —
      // animates to the content's real height without measuring it
      className="grid shrink-0 transition-[grid-template-rows,opacity] duration-300"
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transitionTimingFunction: "var(--ease-out-strong)",
      }}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="border-b border-line bg-page">
          <div
            className="no-scrollbar flex snap-x scroll-px-3 gap-3 overflow-x-auto
              overscroll-x-contain pt-2.5 pb-3"
            style={{
              paddingLeft: "max(12px, env(safe-area-inset-left))",
              paddingRight: "max(12px, env(safe-area-inset-right))",
            }}
          >
            {projects.map((project) => {
              const active = project.id === activeId;
              return (
                <Link
                  key={project.id}
                  ref={active ? activeRef : undefined}
                  href={`/p/${project.id}`}
                  onClick={onSelect}
                  aria-current={active ? "page" : undefined}
                  tabIndex={open ? 0 : -1}
                  title={project.name}
                  className="group/tile flex w-[72px] shrink-0 snap-start flex-col items-center gap-1.5"
                >
                  <Tile active={active}>
                    {project.emoji ? (
                      <span className="text-[26px] leading-none">{project.emoji}</span>
                    ) : (
                      // no emoji picked: the initial still gives the tile an
                      // identity you can aim at without reading the label
                      <span
                        className={`text-[22px] leading-none font-semibold ${
                          active ? "text-ink" : "text-ink-3"
                        }`}
                      >
                        {project.name.trim().charAt(0).toUpperCase() || "•"}
                      </span>
                    )}
                  </Tile>
                  <span
                    className={`line-clamp-2 min-h-8 text-center text-label font-medium
                      [overflow-wrap:anywhere] ${active ? "text-ink" : "text-ink-3"}`}
                  >
                    {project.name}
                  </span>
                </Link>
              );
            })}

            <button
              type="button"
              onClick={onNewProject}
              aria-label="New project"
              tabIndex={open ? 0 : -1}
              className="group/tile flex w-[72px] shrink-0 snap-start flex-col items-center gap-1.5"
            >
              <Tile active={false}>
                <span className="text-ink-3">
                  <IconPlus size={22} />
                </span>
              </Tile>
              <span className="min-h-8 text-center text-label font-medium text-ink-3">New</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
