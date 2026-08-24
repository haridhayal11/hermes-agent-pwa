"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/* The library ships no dropdown, and there is no Radix here. This is the
 * minimum that behaves: a trigger, a panel anchored under it, an invisible
 * full-screen layer to catch the dismissing tap (a phone has no blur to lean
 * on), Escape, and roving arrow-key focus over the items.
 *
 * Deliberately not a portal. The only caller is the header, which has no
 * overflow or transform between it and the viewport, so an absolute panel
 * positions correctly and stays in the same accessibility subtree as its
 * trigger. */

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}

export function MenuItem({
  icon,
  label,
  hint,
  tone = "default",
  onSelect,
}: {
  icon?: ReactNode;
  label: string;
  /** right-aligned secondary text — a shortcut, a count, a state */
  hint?: string;
  tone?: "default" | "danger";
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`flex h-9 w-full items-center gap-2.5 rounded-control px-2 text-left
        text-label font-medium transition-colors duration-100
        hover:bg-hover-2 focus-visible:bg-hover-2 focus-visible:outline-none
        active:scale-[0.98] ${tone === "danger" ? "text-red" : "text-ink"}`}
    >
      {icon && (
        <span className={`flex size-4 shrink-0 items-center justify-center ${
          tone === "danger" ? "text-red" : "text-ink-3"
        }`}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-meta text-ink-3">{hint}</span>}
    </button>
  );
}

export function Menu({
  label,
  trigger,
  align = "start",
  children,
}: {
  /** accessible name for the trigger */
  label: string;
  /** glyph rendered inside the trigger button */
  trigger: ReactNode;
  align?: "start" | "end";
  /** render prop — `close` so an item can dismiss the menu as it acts */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Focus goes back to the trigger on close, wherever the close came from —
  // an item, Escape, or a tap outside. Done here rather than inside `close`
  // so no ref is read during render.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Focus the first item so the menu is operable from the keyboard the
    // moment it opens; on touch this is invisible and harmless.
    const first = panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
      if (items.length === 0) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = (current + delta + items.length) % items.length;
      items[next].focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="tap-target flex size-9 shrink-0 items-center justify-center rounded-control
          text-ink-2 transition-colors duration-100 hover:bg-hover-2 hover:text-ink
          active:scale-[0.96]"
      >
        {trigger}
      </button>

      {open && (
        <>
          {/* catches the dismissing tap. Transparent, but it must sit above the
              page and below the panel, or the first tap outside lands on
              whatever it is over instead of just closing the menu. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            ref={panelRef}
            role="menu"
            aria-label={label}
            className={`absolute top-full z-50 mt-1 min-w-[204px] rounded-card border border-line
              bg-surface p-1 shadow-overlay ${align === "end" ? "right-0" : "left-0"}`}
            style={{
              animation: "pop-in var(--duration-quick) var(--ease-out-strong) both",
              transformOrigin: align === "end" ? "top right" : "top left",
            }}
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}
