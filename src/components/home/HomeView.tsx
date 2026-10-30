"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useActivity } from "@/components/ActivityContext";
import { StatusDot } from "@/components/chat/RunDot";
import { useHydrated } from "@/components/chat/MessageActions";
import { IconClock } from "@/components/primitives/icons";
import type { ActivityItem } from "@/lib/activity";
import type { Project } from "@/lib/chat-types";
import { relativeTime } from "@/lib/relative-time";

/* Home: the one screen that answers "is anything waiting on me?" across every
 * project. Sections appear only when they have something in them, in the
 * order they matter — a decision the agent is blocked on, then what is still
 * working, then what finished while you were away. */

const RECENT_PROJECTS = 6;

const row =
  "flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-2 text-left transition-colors duration-150 hover:bg-hover";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="flex flex-col"
      style={{ animation: "fade-up var(--duration-medium) var(--ease-out-strong) both" }}
    >
      <h2 className="px-2.5 pb-1.5 text-label font-medium text-ink-3">{title}</h2>
      <ul className="flex flex-col gap-px">{children}</ul>
    </section>
  );
}

function Tile({ project }: { project: Pick<Project, "emoji" | "name"> }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-field text-ui font-medium text-ink-2">
      {project?.emoji ?? (project?.name.trim().charAt(0).toUpperCase() || "•")}
    </span>
  );
}

/** "Project · chat", collapsed to the project when the chat shares its name. */
function where(item: ActivityItem) {
  return item.sessionTitle && item.sessionTitle !== item.projectName
    ? `${item.projectName} · ${item.sessionTitle}`
    : item.projectName;
}

function ActivityRow({
  item,
  project,
  hydrated,
}: {
  item: ActivityItem;
  project: Project | undefined;
  hydrated: boolean;
}) {
  const href =
    item.state === "approval"
      ? `/p/${item.projectId}/s/${item.sessionId}?approval=${encodeURIComponent(item.runId)}`
      : `/p/${item.projectId}/s/${item.sessionId}`;
  const verb =
    item.state === "running" ? "Started" : item.state === "approval" ? "Asked" : "Finished";
  return (
    <li>
      <Link href={href} className={row}>
        <Tile project={project ?? { emoji: null, name: item.projectName }} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-ui font-medium text-ink">{where(item)}</span>
            {hydrated && (
              <span className="shrink-0 text-meta text-ink-3 tabular-nums">
                {item.state === "failed" ? "Failed" : verb} {relativeTime(item.at)}
              </span>
            )}
          </span>
          {item.detail && (
            <span
              className={`line-clamp-2 text-label text-ink-2 ${
                item.state === "approval" ? "font-mono" : ""
              }`}
            >
              {item.detail}
            </span>
          )}
        </span>
        <StatusDot state={item.state} />
      </Link>
    </li>
  );
}

export function HomeView({ projects }: { projects: Project[] }) {
  const { activity } = useActivity();
  const hydrated = useHydrated();
  const byId = new Map(projects.map((project) => [project.id, project]));
  const items = activity?.items ?? [];
  const approvals = items.filter((item) => item.state === "approval");
  const running = items.filter((item) => item.state === "running");
  const replies = items.filter((item) => item.state === "unseen" || item.state === "failed");
  const scheduled = activity?.scheduled && activity.scheduled.unread > 0 ? activity.scheduled : null;
  const quiet = activity !== null && items.length === 0 && !scheduled;

  const recent = [...projects]
    .sort((a, b) => b.last_active_at - a.last_active_at)
    .slice(0, RECENT_PROJECTS);

  return (
    <div className="scroll-area flex-1 overflow-y-auto">
      <div className="pb-safe mx-auto flex w-full max-w-[768px] flex-col gap-6 px-2 pt-4 pb-10 sm:px-4">
        {quiet && (
          <p className="px-2.5 text-ui text-ink-2">Nothing is waiting on you.</p>
        )}

        {approvals.length > 0 && (
          <Section title="Needs you">
            {approvals.map((item) => (
              <ActivityRow key={item.sessionId} item={item} project={byId.get(item.projectId)} hydrated={hydrated} />
            ))}
          </Section>
        )}

        {running.length > 0 && (
          <Section title="Running">
            {running.map((item) => (
              <ActivityRow key={item.sessionId} item={item} project={byId.get(item.projectId)} hydrated={hydrated} />
            ))}
          </Section>
        )}

        {replies.length > 0 && (
          <Section title="New replies">
            {replies.map((item) => (
              <ActivityRow key={item.sessionId} item={item} project={byId.get(item.projectId)} hydrated={hydrated} />
            ))}
          </Section>
        )}

        {scheduled && (
          <Section title="Scheduled">
            <li>
              <Link href={`/p/${scheduled.projectId}/s/${scheduled.sessionId}`} className={row}>
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-field text-ink-2">
                  <IconClock size={16} />
                </span>
                <span className="min-w-0 flex-1 truncate text-ui font-medium text-ink">
                  {scheduled.unread === 1 ? "1 new report" : `${scheduled.unread} new reports`} in{" "}
                  {byId.get(scheduled.projectId)?.name ?? "General"}
                </span>
                <span className="min-w-5 rounded-full bg-accent-tint px-1.5 text-center text-meta font-medium text-ink tabular-nums">
                  {scheduled.unread}
                </span>
              </Link>
            </li>
          </Section>
        )}

        <Section title="Projects">
          {recent.map((project) => (
            <li key={project.id}>
              <Link href={`/p/${project.id}`} className={row}>
                <Tile project={project} />
                <span className="min-w-0 flex-1 truncate text-ui text-ink">{project.name}</span>
                {hydrated && (
                  <span className="shrink-0 text-meta text-ink-3 tabular-nums">
                    {relativeTime(project.last_active_at)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </Section>
      </div>
    </div>
  );
}
