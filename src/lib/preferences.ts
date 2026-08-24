/* Per-device display preferences.
 *
 * Deliberately localStorage and not a SQLite table. Everything in here is a
 * property of *this* screen — theme, text size, how much of a tool call you
 * want to see on a 390px phone — and syncing it between the iPhone and the
 * Mac would be wrong more often than right. The consequence is that anything
 * the server has to decide (see run-manager's push threshold) cannot live
 * here, because a Node process can't read a browser's localStorage.
 */

import { APP_SLUG } from "./branding";

/** hidden = never rendered · collapsed = rendered, closed · expanded = open */
export type Disclosure = "hidden" | "collapsed" | "expanded";

export type Theme = "system" | "light" | "dark";
export type TextSize = "small" | "normal" | "large";

export interface Preferences {
  theme: Theme;
  /** how tool call rows start out on each new run */
  toolCalls: Disclosure;
  /** same tri-state for the "_thinking" trace */
  thinking: Disclosure;
  textSize: TextSize;
  /** OR'd with the OS `prefers-reduced-motion` — this can only ever add */
  reduceMotion: boolean;
  /** Enter sends, Shift+Enter newlines. Ignored on touch: the on-screen
   *  keyboard's return key has to insert a newline or multi-line prompts
   *  become impossible to type. */
  sendOnEnter: boolean;
  /** follow the tail of a running response */
  autoScroll: boolean;
  /** the elapsed-time readout on the run status line */
  showRunDuration: boolean;
  /** navigator.vibrate on send and on run completion */
  haptics: boolean;
}

/* Notifications are deliberately *not* a preference. Whether this device gets
 * them is a property of its push subscription and the browser's permission
 * grant, both of which can change without us — a stored boolean would only
 * ever be a second opinion that drifts. usePush reads the truth instead. */

export const PREFS_KEY = `${APP_SLUG}.prefs.v1`;

export const DEFAULTS: Preferences = {
  theme: "dark",
  toolCalls: "expanded",
  thinking: "collapsed",
  textSize: "normal",
  reduceMotion: false,
  sendOnEnter: true,
  autoScroll: true,
  showRunDuration: true,
  haptics: true,
};

export const DISCLOSURES: Disclosure[] = ["hidden", "collapsed", "expanded"];
export const THEMES: Theme[] = ["system", "light", "dark"];
export const TEXT_SIZES: TextSize[] = ["small", "normal", "large"];

// Enum-valued keys are checked against their allowed set rather than by
// typeof, so a stale value from an older build can't put the UI into a state
// no control can represent.
const ENUMS: Partial<Record<keyof Preferences, readonly string[]>> = {
  theme: THEMES,
  toolCalls: DISCLOSURES,
  thinking: DISCLOSURES,
  textSize: TEXT_SIZES,
};

/**
 * Reads and validates stored preferences, merged over the defaults. Safe to
 * call on the server (returns DEFAULTS) and safe against a partially written
 * or hand-edited value — one bad key must not take the app down.
 */
export function readPrefs(): Preferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return DEFAULTS;
    const merged: Preferences = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as (keyof Preferences)[]) {
      const value = parsed[key];
      if (value === undefined) continue;
      const allowed = ENUMS[key];
      if (allowed) {
        if (typeof value === "string" && allowed.includes(value)) {
          Object.assign(merged, { [key]: value });
        }
        continue;
      }
      if (typeof value === typeof DEFAULTS[key]) {
        Object.assign(merged, { [key]: value });
      }
    }
    return merged;
  } catch {
    return DEFAULTS;
  }
}

export function writePrefs(prefs: Preferences) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Safari in private mode throws on setItem. The in-memory state is still
    // correct for this session; only persistence is lost.
  }
}

/** True when the OS asks for reduced motion, independent of our own toggle. */
export function systemReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function resolveDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Pushes the CSS-driven preferences onto <html>. This is the *same* work the
 * blocking script in layout.tsx does before first paint — kept in sync by
 * hand, because that script cannot import a module.
 */
export function applyPrefsToDocument(prefs: Preferences) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolveDark(prefs.theme));
  root.dataset.textSize = prefs.textSize;
  const reduce = prefs.reduceMotion || systemReducedMotion();
  if (reduce) root.dataset.reduceMotion = "1";
  else delete root.dataset.reduceMotion;
  // Keeps form controls, scrollbars and the overscroll gutter in step with
  // the palette; without it rubber-banding exposes a white strip in dark.
  const dark = resolveDark(prefs.theme);
  root.style.colorScheme = dark ? "dark" : "light";

  // In standalone the status bar is tinted from this, and layout.tsx can only
  // declare one value at build time. Follow the live theme instead.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0a0a0a" : "#fafafa");
}
