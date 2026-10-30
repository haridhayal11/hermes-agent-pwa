"use client";

import { useCallback, useRef, useState } from "react";
import { useActivity } from "@/components/ActivityContext";
import { IconBell } from "@/components/primitives/icons";
import { NotificationsPanel } from "./NotificationsPanel";

/* The header's bell. Its count is the app icon's badge — the same number from
 * the same snapshot — so the two can never disagree about what is waiting. */
export function NotificationsButton() {
  const { activity } = useActivity();
  const [open, setOpen] = useState(false);
  const bell = useRef<HTMLButtonElement>(null);
  const count = activity?.badge ?? 0;

  const close = useCallback(() => {
    setOpen(false);
    bell.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      <button
        ref={bell}
        type="button"
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="tap-target relative flex size-10 items-center justify-center rounded-control text-ink-2
          transition-[color,background-color,transform] duration-150 hover:bg-hover hover:text-ink active:scale-[0.96]"
      >
        <IconBell size={20} />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute top-1 right-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-micro leading-4 font-semibold text-page tabular-nums"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <NotificationsPanel open={open} onClose={close} />
    </>
  );
}
