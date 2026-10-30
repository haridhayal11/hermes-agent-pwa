"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  IconCheck,
  IconCopy,
  IconEdit,
  IconRepeat,
  IconRetry,
  IconShare,
} from "@/components/primitives/icons";

/* The quiet row under a message: copy, share, edit, retry, and when it was
 * said.
 *
 * Copy exists because the shell suppresses long-press selection everywhere
 * but the transcript, and selecting a long reply on a phone is miserable
 * anyway. It copies the raw text — Markdown and all — because that is what
 * pastes well into another chat, a note or an issue.
 *
 * On a device with hover the row stays out of the way until the message is
 * hovered or focused; on touch there is no hover to reveal it with, so it is
 * always there, just dim. `persistent` keeps it visible regardless — the last
 * turn's Retry is the redo once a run is over, not something to hunt for. */

const noopSubscribe = () => () => {};

/** false on the server and during hydration, true after. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function useCanShare(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
}

const buttonClass =
  "flex h-8 min-w-8 items-center justify-center gap-1 rounded-control px-2 text-label text-ink-2 transition-[color,background-color,transform] duration-150 hover:bg-hover hover:text-ink active:scale-[0.97]";

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function MessageActions({
  content,
  createdAt,
  align = "start",
  persistent = false,
  onRetry,
  onEdit,
  onRepeat,
}: {
  content: string;
  createdAt?: number;
  align?: "start" | "end";
  persistent?: boolean;
  onRetry?: () => void;
  onEdit?: () => void;
  /** turn this prompt into a scheduled job */
  onRepeat?: () => void;
}) {
  const hydrated = useHydrated();
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }, [content]);

  const share = useCallback(() => {
    // AbortError is the user closing the sheet — nothing to report
    navigator.share({ text: content }).catch(() => {});
  }, [content]);

  return (
    <div
      className={`-mx-2 flex items-center gap-0.5 transition-opacity duration-150 ${
        align === "end" ? "flex-row-reverse" : ""
      } ${
        persistent
          ? ""
          : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/msg:opacity-100 [@media(hover:hover)]:focus-within:opacity-100"
      }`}
    >
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy message"}
        title="Copy"
        className={buttonClass}
      >
        {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
        {copied && <span>Copied</span>}
      </button>
      {canShare && (
        <button
          type="button"
          onClick={share}
          aria-label="Share message"
          title="Share"
          className={buttonClass}
        >
          <IconShare size={16} />
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit and resend"
          title="Edit and resend"
          className={buttonClass}
        >
          <IconEdit size={16} />
        </button>
      )}
      {onRepeat && (
        <button
          type="button"
          onClick={onRepeat}
          aria-label="Repeat on a schedule"
          title="Repeat on a schedule"
          className={buttonClass}
        >
          <IconRepeat size={16} />
        </button>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} className={buttonClass}>
          <IconRetry size={16} />
          Retry
        </button>
      )}
      {/* After hydration only: the server's timezone is not the phone's. */}
      {hydrated && createdAt && (
        <time
          dateTime={new Date(createdAt).toISOString()}
          title={new Date(createdAt).toLocaleString()}
          className="px-2 text-meta text-ink-3 tabular-nums"
        >
          {timeOf(createdAt)}
        </time>
      )}
    </div>
  );
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayLabel(ts: number, now = new Date()): string {
  const date = new Date(ts);
  if (sameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** True when `ts` falls on a different local day from `previous`. */
export function startsNewDay(ts: number, previous: number | undefined): boolean {
  return previous === undefined || !sameDay(new Date(ts), new Date(previous));
}

export function DaySeparator({ ts }: { ts: number }) {
  return (
    <div role="separator" className="flex justify-center py-1" aria-label={dayLabel(ts)}>
      <span className="text-label font-medium text-ink-3">{dayLabel(ts)}</span>
    </div>
  );
}
