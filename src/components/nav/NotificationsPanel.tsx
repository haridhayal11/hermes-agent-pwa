"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useActivity } from "@/components/ActivityContext";
import { useHydrated } from "@/components/chat/MessageActions";
import { StatusDot } from "@/components/chat/RunDot";
import { IconBell, IconClock, IconCross, IconQuestion } from "@/components/primitives/icons";
import { buttonClass, ICON_BUTTON } from "@/components/ui/SettingsControls";
import type { NotificationItem } from "@/lib/activity";
import { relativeTime } from "@/lib/relative-time";

/* Everything that happened while you weren't looking, and everything waiting
 * on you, in one list — newest first, with approvals and open questions held
 * at the top until they are answered.
 *
 * Built for the way the app is actually used: one main conversation, briefs
 * arriving into it, and decisions that arrive inside those briefs. A question
 * card can be answered here without opening the chat; an approval can be
 * allowed or denied here when the gateway offers that choice. Everything else
 * is a link into its chat, and opening the chat is what marks it read. */

const APPROVAL_LABEL: Record<string, string> = {
  once: "Allow once",
  deny: "Deny",
};

function where(item: NotificationItem) {
  return item.sessionTitle && item.sessionTitle !== item.projectName
    ? `${item.projectName} · ${item.sessionTitle}`
    : item.projectName;
}

function href(item: NotificationItem) {
  const chat = `/p/${item.projectId}/s/${item.sessionId}`;
  return item.kind === "approval" && item.runId
    ? `${chat}?approval=${encodeURIComponent(item.runId)}`
    : chat;
}

function KindMark({ item }: { item: NotificationItem }) {
  if (item.kind === "approval") return <StatusDot state="approval" />;
  if (item.kind === "failed") return <StatusDot state="failed" />;
  const Icon = item.kind === "report" ? IconClock : item.kind === "question" ? IconQuestion : IconBell;
  return (
    <span className={item.kind === "question" ? "text-orange" : "text-ink-3"}>
      <Icon size={16} />
    </span>
  );
}

function Row({
  item,
  hydrated,
  onOpen,
}: {
  item: NotificationItem;
  hydrated: boolean;
  onOpen: (item: NotificationItem) => void;
}) {
  const { refresh } = useActivity();
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  // Answering in place: the reply goes into the chat as your next message,
  // exactly as pressing the card's button there would.
  async function answer(reply: string) {
    setState("busy");
    const response = await fetch(
      `/api/projects/${item.projectId}/sessions/${item.sessionId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply }),
      },
    ).catch(() => null);
    setState(response?.ok ? "done" : "failed");
    refresh();
  }

  async function decide(choice: string) {
    if (!item.runId) return;
    setState("busy");
    const response = await fetch(`/api/runs/${item.runId}/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice }),
    }).catch(() => null);
    setState(response?.ok ? "done" : "failed");
    refresh();
  }

  const quickChoices = (item.choices?.length ? item.choices : ["once", "deny"]).filter(
    (choice) => choice in APPROVAL_LABEL,
  );

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex w-full items-start gap-3 px-4 pt-3 pb-3 text-left transition-colors duration-150 hover:bg-hover"
      >
        <span className="mt-1 grid size-4 shrink-0 place-items-center">
          <KindMark item={item} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span
              className={`min-w-0 flex-1 truncate text-label ${
                item.unread ? "font-medium text-ink" : "text-ink-2"
              }`}
            >
              {where(item)}
            </span>
            {hydrated && (
              <span className="shrink-0 text-meta text-ink-3 tabular-nums">{relativeTime(item.at)}</span>
            )}
          </span>
          {item.title && (
            <span className={`text-ui ${item.unread ? "font-medium text-ink" : "text-ink-2"}`}>
              {item.title}
            </span>
          )}
          {item.body && (
            <span
              className={`line-clamp-2 text-label ${
                item.kind === "approval" ? "font-mono text-ink" : "text-ink-2"
              }`}
            >
              {item.body}
            </span>
          )}
        </span>
        {item.unread && (
          <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
        )}
      </button>

      {/* Actions sit outside the row's button: a button inside a button is
        * invalid, and a tap on "Deny" must never also open the chat. */}
      {(item.kind === "question" || item.kind === "approval") && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pl-11">
          {state === "done" ? (
            <span className="text-label text-ink-3">
              {item.kind === "approval" ? "Answered" : "Sent"}
            </span>
          ) : (
            <>
              {item.kind === "question" &&
                item.question?.actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    disabled={state === "busy"}
                    onClick={() => void answer(action.reply)}
                    className={`${buttonClass("secondary", "sm")} h-8 px-3 text-label`}
                  >
                    {action.label}
                  </button>
                ))}
              {item.kind === "approval" &&
                quickChoices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    disabled={state === "busy"}
                    onClick={() => void decide(choice)}
                    className={`${buttonClass(choice === "deny" ? "secondary-danger" : "secondary", "sm")} h-8 px-3 text-label`}
                  >
                    {APPROVAL_LABEL[choice]}
                  </button>
                ))}
              {state === "failed" && (
                <span className="text-label text-red">Didn&rsquo;t go through</span>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return <Panel onClose={onClose} />;
}

function Panel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { activity, refresh } = useActivity();
  const closeRef = useRef<HTMLButtonElement>(null);
  const feed = activity?.feed ?? [];
  const unread = feed.some((item) => item.unread && item.kind !== "approval");

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    refresh();
  }, [refresh]);

  const open = (item: NotificationItem) => {
    onClose();
    router.push(href(item));
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/read", { method: "POST" }).catch(() => null);
    refresh();
  };

  return (
    <div className="h-app fixed inset-x-0 top-0 z-60 flex flex-col sm:items-end sm:px-3 sm:pt-14">
      {/* Phone: the panel is the whole screen. Above sm it hangs from the
        * bell, and a tap anywhere else dismisses it. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default sm:bg-transparent"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-page
          [animation:fade-in_var(--duration-quick)_ease-out_both] sm:max-h-[min(36rem,70vh)]
          sm:w-[400px] sm:flex-none sm:rounded-popover sm:bg-surface sm:shadow-overlay
          sm:[transform-origin:top_right] sm:[animation:pop-in_var(--duration-quick)_var(--ease-out-strong)_both]"
      >
        <div className="pt-safe shrink-0 border-b border-line sm:pt-0">
          <div className="px-safe flex h-12 items-center gap-2 pl-4 sm:px-2 sm:pl-4">
            <span className="flex-1 text-title font-semibold text-ink">Notifications</span>
            {unread && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className={`${buttonClass("ghost", "sm")} h-8 px-3 text-label`}
              >
                Mark all read
              </button>
            )}
            <button
              ref={closeRef}
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={ICON_BUTTON}
            >
              <IconCross size={16} />
            </button>
          </div>
        </div>

        <ul className="scroll-area pb-safe min-h-0 flex-1 overflow-y-auto overscroll-contain sm:pb-0">
          {activity === null && <li className="px-4 py-6 text-label text-ink-3">Loading…</li>}
          {activity !== null && feed.length === 0 && (
            <li className="px-4 py-6 text-label text-ink-3">
              Nothing new. Replies that finish while you&rsquo;re away, scheduled
              reports and anything waiting on you will show up here.
            </li>
          )}
          {feed.map((item) => (
            <Row key={item.id} item={item} hydrated={hydrated} onOpen={open} />
          ))}
        </ul>
      </div>
    </div>
  );
}
