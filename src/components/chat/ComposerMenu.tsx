"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSkillCatalogue } from "@/components/nav/SkillPicker";
import {
  COMMAND_CATALOGUE,
  REASON_LABEL,
  SLASH_COMMANDS,
  UNROUTED_REASON,
  type SlashCommand,
} from "@/lib/commands";
import type { HermesFeatures } from "@/hooks/useStatus";
import { IconAt, IconSlash } from "@/components/primitives/icons";

/* PromptBar's @-sources and /-commands menus, restored — the originals were
 * dropped when this composer was lifted because they were scripted demo lists.
 * These are driven by the real catalogues: /api/skills for `@`, and the
 * client-side dispatch table in lib/commands.ts for `/`.
 *
 * One popover, two modes. It anchors above the bar because the bar is at the
 * bottom of the viewport and the iOS keyboard is under that. */

export type MenuMode =
  | { kind: "mention"; query: string; start: number }
  | { kind: "command"; query: string };

export interface MenuItem {
  key: string;
  title: string;
  subtitle?: string;
  /** greyed and unselectable — listed for honesty, not for use */
  disabled?: boolean;
  /** why it's greyed: "no endpoint", "not wired up", "CLI only" */
  tag?: string;
  /** section heading rendered above this item */
  heading?: string;
}

/** Everything the composer needs to know about what's on screen. */
export interface MenuState {
  items: MenuItem[];
  /** the item the arrow keys are on; -1 when nothing is selectable */
  index: number;
}

export function useMenuItems(
  mode: MenuMode | null,
  features: HermesFeatures,
  running: boolean,
): { items: MenuItem[]; commands: SlashCommand[] } {
  const skills = useSkillCatalogue();

  return useMemo(() => {
    if (!mode) return { items: [], commands: [] };

    if (mode.kind === "mention") {
      const q = mode.query;
      const matched = skills
        .filter(
          (s) =>
            !q ||
            s.name.toLowerCase().includes(q) ||
            (s.description ?? "").toLowerCase().includes(q),
        )
        .slice(0, 8);
      return {
        commands: [],
        items: matched.map((s) => ({
          key: s.name,
          title: s.name,
          subtitle: s.description,
        })),
      };
    }

    const q = mode.query;
    const commands = SLASH_COMMANDS.filter((c) => {
      // A capability the connected Hermes doesn't advertise would 404; hide it
      // rather than offer a button that can only fail.
      if (c.requires && !features[c.requires]) return false;
      if (c.activeRunOnly && !running) return false;
      if (!q) return true;
      return (
        c.name.startsWith(q) ||
        (c.aliases ?? []).some((a) => a.startsWith(q)) ||
        c.description.toLowerCase().includes(q)
      );
    });

    /* The catalogue is Telegram's whole menu, and it is listed whole — a bare
     * "/" here shows what a bare "/" shows in the Telegram client. The twelve
     * that work sit above it under their own heading, so nothing is buried;
     * the box scrolls. */
    const catalogue = COMMAND_CATALOGUE.filter((c) => {
      if (!q) return true;
      return (
        c.name.slice(1).startsWith(q) ||
        (c.aliases ?? []).some((a) => a.startsWith(q)) ||
        c.description.toLowerCase().includes(q)
      );
    });

    return {
      commands,
      items: [
        ...commands.map((c, i) => ({
          key: c.name,
          title: `/${c.name}${c.args ? ` ${c.args}` : ""}`,
          subtitle: c.description,
          heading: i === 0 ? "Runs here" : undefined,
        })),
        ...catalogue.map((c, i) => ({
          key: `catalogue:${c.name}`,
          title: `${c.name}${c.args ? ` ${c.args}` : ""}`,
          subtitle: c.note ? `${c.description} — ${c.note}` : c.description,
          disabled: true,
          tag: REASON_LABEL[c.reason],
          heading:
            i === 0
              ? q
                ? `In Hermes (${catalogue.length})`
                : `In Hermes, not here (${COMMAND_CATALOGUE.length})`
              : undefined,
        })),
      ],
    };
  }, [mode, skills, features, running]);
}

export function ComposerMenu({
  mode,
  items,
  index,
  onSelect,
  showUnroutedNote,
}: {
  mode: MenuMode;
  items: MenuItem[];
  index: number;
  onSelect: (item: MenuItem, at: number) => void;
  showUnroutedNote: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the arrow-key cursor inside the scroll box. `block: "nearest"` so it
  // doesn't yank the page under the keyboard on iOS.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (items.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label={mode.kind === "mention" ? "Skills" : "Commands"}
      className="absolute inset-x-0 bottom-full z-30 mb-1.5 overflow-hidden rounded-card bg-surface shadow-overlay"
      style={{ animation: "pop-in var(--duration-quick) var(--ease-out-strong) both" }}
    >
      <div className="primitive-card-bar flex items-center gap-1.5 text-meta text-ink-3">
        <span className="flex size-3.5 items-center justify-center">
          {mode.kind === "mention" ? <IconAt size={12} /> : <IconSlash size={12} />}
        </span>
        <span>{mode.kind === "mention" ? "Link a skill" : "Commands"}</span>
      </div>

      <div ref={listRef} className="max-h-[46dvh] overflow-y-auto overscroll-contain scroll-area">
        {items.map((item, i) => (
          <div key={item.key}>
            {item.heading && (
              <div className="sticky top-0 z-10 bg-surface px-3 pt-2 pb-1 text-meta font-semibold tracking-[0.06em] text-ink-3 uppercase">
                {item.heading}
              </div>
            )}
            <button
              type="button"
              role="option"
              aria-selected={i === index}
              data-index={i}
              disabled={item.disabled}
              // The textarea must not lose focus, or iOS closes the keyboard and
              // the caret position we're inserting at is gone.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(item, i)}
              className={`flex w-full items-baseline gap-2 px-3 py-2 text-left transition-colors duration-100
                disabled:cursor-default ${
                  item.disabled
                    ? "opacity-60"
                    : i === index
                      ? "bg-hover"
                      : "hover:bg-hover-2"
                }`}
            >
              <span
                className={`shrink-0 font-mono text-label ${item.disabled ? "text-ink-3" : "text-ink"}`}
              >
                {item.title}
              </span>
              {item.subtitle && (
                <span className="min-w-0 flex-1 truncate text-meta text-ink-3">
                  {item.subtitle}
                </span>
              )}
              {item.tag && (
                <span className="shrink-0 rounded-chip bg-field px-1.5 text-meta text-ink-3">
                  {item.tag}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>

      {showUnroutedNote && (
        <p className="primitive-card-footer border-t border-line text-meta leading-[1.5] text-ink-3">
          {UNROUTED_REASON}
        </p>
      )}
    </div>
  );
}
