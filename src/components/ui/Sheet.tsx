"use client";

import { useEffect, type ReactNode } from "react";

/* The library ships no drawer or sheet — its sidebar collapses to a 52px icon
 * rail, which is a desktop pattern. This is the mobile half: scrim + panel
 * sliding in from the left, dismissed by scrim tap or Escape, locked scroll
 * behind it. ~50 lines, so it isn't worth pulling Radix in for.
 *
 * It used to carry `lg:hidden`, from when a permanent sidebar stood in for it
 * above `lg`. That sidebar is gone, so on a wide screen the sheet simply did
 * not render and its contents were unreachable. */

export function Sheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="absolute inset-y-0 left-0 flex w-[264px] max-w-[85vw] flex-col overflow-y-auto overscroll-contain bg-canvas shadow-overlay scroll-area sm:w-[380px]"
        style={{
          animation: "panel-in-right var(--duration-fast) var(--ease-smooth-out) both",
          // the panel spans the full height including the notch, so it owns
          // both insets — without the top one the workspace row sits under
          // the status bar
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
          paddingLeft: "env(safe-area-inset-left)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
