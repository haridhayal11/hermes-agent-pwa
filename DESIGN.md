---
name: Hermes PWA
description: A familiar chat client played straight — one calm reading column, a darker sidebar of projects, a pill composer, hue-free greys with hue only for states.
colors:
  # Dark is the default theme. Surfaces separate by value: sidebar < page < raised.
  dark-page: "#141414"
  dark-sidebar: "#0b0b0b"
  dark-raised: "#252525"
  dark-inset: "#0f0f0f"
  dark-field: "#323232"
  dark-ink: "#ececec"
  dark-ink-2: "#b4b4b4"
  dark-ink-3: "#9b9b9b"
  dark-line: "oklch(100% 0 0 / 0.1)"
  dark-line-strong: "oklch(100% 0 0 / 0.16)"
  dark-hover: "oklch(100% 0 0 / 0.06)"
  dark-hover-2: "oklch(100% 0 0 / 0.1)"
  dark-accent-tint: "oklch(100% 0 0 / 0.1)"
  dark-orange: "oklch(77% 0.14 62)"
  dark-orange-tint: "oklch(77% 0.14 62 / 0.14)"
  dark-red: "oklch(68% 0.17 24)"
  dark-red-tint: "oklch(68% 0.17 24 / 0.14)"
  dark-green: "oklch(72% 0.15 152)"
  dark-green-tint: "oklch(72% 0.15 152 / 0.14)"
  dark-scrim: "oklch(0% 0 0 / 0.55)"
  # Light mirrors it: white page, #f9f9f9 sidebar, #f4f4f4 bubbles.
  light-page: "#ffffff"
  light-sidebar: "#f9f9f9"
  light-raised: "#ffffff"
  light-inset: "#f9f9f9"
  light-bubble: "#f4f4f4"
  light-field: "#f0f0f0"
  light-ink: "#0d0d0d"
  light-ink-2: "#5d5d5d"
  light-ink-3: "#737373"
  light-line: "oklch(0% 0 0 / 0.1)"
  light-line-strong: "oklch(0% 0 0 / 0.16)"
  light-hover: "oklch(0% 0 0 / 0.045)"
  light-hover-2: "oklch(0% 0 0 / 0.08)"
  light-accent-tint: "oklch(0% 0 0 / 0.06)"
  light-orange: "oklch(62% 0.16 55)"
  light-orange-tint: "oklch(96% 0.035 70)"
  light-red: "oklch(57% 0.2 25)"
  light-red-tint: "oklch(95.5% 0.025 20)"
  light-green: "oklch(56% 0.14 152)"
  light-green-tint: "oklch(95.5% 0.03 155)"
  light-scrim: "oklch(0% 0 0 / 0.36)"
typography:
  micro:
    fontFamily: "ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.45
  meta:
    fontFamily: "ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  ui:
    fontFamily: "ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  body-wide:
    fontFamily: "ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
  user-message:
    fontFamily: "ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  input:
    fontFamily: "ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
  code:
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  chip: "8px"
  control: "10px"
  card: "16px"
  popover: "16px"
  dialog: "20px"
  bubble: "22px"
  composer: "28px"
  full: "9999px"
spacing:
  gutter: "16px"
  block-gap: "16px"
  turn-gap: "28px"
  turn-gap-wide: "36px"
  composer-pad: "8px"
  header-height: "52px"
  row-height: "36px"
  control: "40px"
  tap: "44px"
  sidebar: "272px"
  thread-max: "768px"
  settings-max: "672px"
components:
  header:
    backgroundColor: "{colors.dark-page}"
    height: "{spacing.header-height}"
  icon-button:
    textColor: "{colors.dark-ink-2}"
    rounded: "{rounded.control}"
    size: "{spacing.control}"
  sidebar:
    backgroundColor: "{colors.dark-sidebar}"
    textColor: "{colors.dark-ink-2}"
    width: "{spacing.sidebar}"
  sidebar-row:
    textColor: "{colors.dark-ink-2}"
    rounded: "{rounded.control}"
    height: "{spacing.row-height}"
    typography: "{typography.ui}"
    padding: "0 10px"
  sidebar-row-active:
    backgroundColor: "{colors.dark-hover-2}"
    textColor: "{colors.dark-ink}"
  user-bubble:
    backgroundColor: "{colors.dark-raised}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.bubble}"
    typography: "{typography.user-message}"
    padding: "10px 16px"
  assistant-prose:
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
  composer:
    backgroundColor: "{colors.dark-raised}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.composer}"
    typography: "{typography.input}"
    padding: "{spacing.composer-pad}"
  send-button:
    backgroundColor: "{colors.dark-ink}"
    textColor: "{colors.dark-page}"
    rounded: "{rounded.full}"
    size: "36px"
  send-button-disabled:
    backgroundColor: "{colors.dark-field}"
    textColor: "{colors.dark-ink-3}"
  stop-button:
    backgroundColor: "{colors.dark-field}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.full}"
    size: "36px"
  button-primary:
    backgroundColor: "{colors.dark-ink}"
    textColor: "{colors.dark-page}"
    rounded: "{rounded.full}"
    typography: "{typography.ui}"
    height: "{spacing.control}"
    padding: "0 16px"
  button-secondary:
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.full}"
    typography: "{typography.ui}"
    height: "{spacing.control}"
    padding: "0 16px"
  button-danger:
    backgroundColor: "{colors.dark-red}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    height: "{spacing.control}"
    padding: "0 16px"
  field:
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.control}"
    typography: "{typography.input}"
    height: "{spacing.control}"
    padding: "0 12px"
  card:
    backgroundColor: "{colors.dark-raised}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  card-blocked:
    backgroundColor: "{colors.dark-red-tint}"
  code-block:
    backgroundColor: "{colors.dark-inset}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.card}"
    typography: "{typography.code}"
  popover:
    backgroundColor: "{colors.dark-raised}"
    rounded: "{rounded.popover}"
    padding: "6px"
  menu-item:
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.control}"
    typography: "{typography.ui}"
    height: "{spacing.row-height}"
    padding: "0 10px"
  dialog:
    backgroundColor: "{colors.dark-raised}"
    rounded: "{rounded.dialog}"
    padding: "20px"
  segmented:
    backgroundColor: "{colors.dark-field}"
    rounded: "{rounded.full}"
    padding: "2px"
  segmented-option:
    textColor: "{colors.dark-ink-2}"
    rounded: "{rounded.full}"
    typography: "{typography.label}"
    height: "32px"
  switch:
    backgroundColor: "{colors.dark-ink}"
    rounded: "{rounded.full}"
    width: "44px"
    height: "26px"
  chip:
    backgroundColor: "{colors.dark-field}"
    textColor: "{colors.dark-ink-2}"
    rounded: "{rounded.chip}"
    typography: "{typography.meta}"
    padding: "0 6px"
  badge-waiting:
    backgroundColor: "{colors.dark-orange-tint}"
    textColor: "{colors.dark-orange}"
    rounded: "{rounded.full}"
    typography: "{typography.meta}"
    padding: "2px 8px"
  toast:
    backgroundColor: "{colors.dark-raised}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.full}"
    typography: "{typography.ui}"
    height: "{spacing.tap}"
---

# Design System: Hermes PWA

Components above resolve against the dark default; the light theme swaps each `dark-*` role for its `light-*` twin of the same role (page, sidebar, raised, ink, line, hue). Both live as CSS custom properties on `:root` and `.dark` in `src/app/globals.css`; no component hardcodes a colour except `#ffffff` on red buttons and the off-state switch knob.

## Overview

**Creative North Star: "The Reading Column"**

A familiar chat client played straight, judged against the ChatGPT app and not against a distinctive world. One calm column of prose and bubbles, a sidebar one step darker than the page, a pill composer that floats over the thread's last line. The system's whole job is to get out of the way of long agent replies, code and tool output, and to make three things visible without hunting: a live run, a pending approval, an unread scheduled report.

The palette is hue-free grey; the faces are the platform's own (SF Pro and SF Mono on Apple, a system fallback elsewhere), so there is nothing to download on a phone. Depth is value in dark and ring plus soft drop in light. Hue is rationed to states that ask something of you. Density is generous where reading happens (16px at 1.7 to 1.75, 28 to 36px between turns) and compact where chrome lives (14px, 36px rows). The look it rejects is the pre-redesign one: 12 to 13px chrome, a web font on a flat grey ramp, a cramped thread.

**Key Characteristics:**
- One reading column, 768px max, centred; the sidebar is a permanent 272px column from `lg`, a drawer below.
- Surfaces separate by value, not outline: sidebar #0b0b0b < page #141414 < raised #252525 in dark.
- Ink is the accent. Primary actions are ink-on-page pills; there is no brand hue.
- Hue only as signal: orange for waiting on you, red for failure and danger. Completed states are neutral.
- Pill and circle controls (full radius) for actions; 10px rounded rectangles for rows and fields; 28px composer, 22px bubbles.
- Motion is short ease-out fades and small rises, capped at 300ms, with no bounce.

## Colors

A hue-free grey ladder in two mirrored themes, with three signal hues held in reserve.

### Primary
- **Ink as Accent** (`dark-ink` #ececec / `light-ink` #0d0d0d): the single interactive colour. It fills the primary pill, the send circle, the switch track and the focus ring, and it is the text colour. The `--accent` token is separate from `--ink` in the stylesheet so a hue could be introduced there alone, but today they are identical.

### Secondary
- **Waiting Orange** (`dark-orange` oklch(77% 0.14 62) / `light-orange` oklch(62% 0.16 55)): the run is blocked on the reader. The "Waiting" badge on the approval card, the question card's icon, and the header run dot while `waiting_for_approval`. Its tint (`*-orange-tint`) is the badge ground.

### Tertiary
- **Failure Red** (`dark-red` oklch(68% 0.17 24) / `light-red` oklch(57% 0.2 25)): failed tool dot, error toast dot, destructive buttons and menu items, the Blocked badge, and `red-tint` as the ground of a smart-denied approval card.
- **Affirmative Green** (`dark-green` oklch(72% 0.15 152) / `light-green` oklch(56% 0.14 152)): a reserved token for explicit confirmation only (the "Copied" tick, Hermes "reachable", the Allow glyph). It is not the colour of a finished run or tool; see Named Rules.

### Neutral
- **Page** (`dark-page` #141414 / `light-page` #ffffff): the thread, header and settings ground. Also the `themeColor` and pre-paint colour.
- **Sidebar** (`dark-sidebar` #0b0b0b / `light-sidebar` #f9f9f9): one step darker than the page in dark; drawer panel. Token name in code is `canvas`.
- **Raised** (`dark-raised` #252525 / `light-raised` #ffffff): composer, cards, popovers, dialogs, toast. `light-bubble` #f4f4f4 is the light user bubble; in dark the bubble is the raised grey.
- **Inset** (`dark-inset` #0f0f0f / `light-inset` #f9f9f9): code blocks and wells inside a card.
- **Field** (`dark-field` #323232 / `light-field` #f0f0f0): chips, segmented tracks, inline code, the disabled send circle.
- **Ink ramp** (`ink` #ececec / `ink-2` #b4b4b4 / `ink-3` #9b9b9b in dark; #0d0d0d / #5d5d5d / #737373 in light): primary text, secondary text and icons, placeholders and metadata. `ink-3` is held at 5.7:1 on raised dark and 4.7:1 on white so placeholders pass.
- **Hairlines and hovers** (white at 10% / 16% in dark, black at 10% / 16% in light for `line` / `line-strong`; hover 6% and 10% dark, 4.5% and 8% light): row dividers, input rings, hover and active-row washes.
- **Scrim** (black at 55% dark, 36% light): behind dialogs, sheets and the drawer.

### Named Rules
**The Hue-Is-A-Signal Rule.** Hue means the run needs you (orange) or something failed (red). A running run is shown by a neutral `ink-2` pulsing dot, and a completed tool call is a quiet `ink-3` check. Completed, on, and ordinary-success states are neutral; do not tint them.

**The Value-Not-Outline Rule.** In dark, separation comes from the step between #0b0b0b, #141414 and #252525. A raised surface gets at most a 6 to 8% white ring, never a visible border.

**The Ink-Is-The-Accent Rule.** The primary action is `ink` on `page` (near-white pill in dark, near-black in light). Do not introduce a brand colour for buttons, links or selection.

## Typography

**Display Font:** none. There is no display tier; the largest type in the app is the 17px title.
**Body / UI Font:** the platform's UI face (`ui-sans-serif, -apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif`): SF Pro on iPhone and Mac. No web font is loaded.
**Label/Mono Font:** `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` for code, tool names, paths and the Settings values.

**Character:** the category's own type, unadorned. Hierarchy comes from size steps and three weights (400, 500, 600), never from case, tracking or a second family.

### Hierarchy
- **Title** (600, 17px, 1.3): header project name from `sm` up, dialog titles, the sidebar wordmark.
- **Body** (400, 16px, 1.7; 1.75 from `sm` / 640px): assistant prose, list items, markdown paragraphs. Markdown headings are 600 at body x 1.25 (h1), x 1.125 (h2) and x 1 (h3 and below), line-height 1.4.
- **User message** (400, 16px, 1.55): the bubble; tighter than the reply because it is short.
- **Input** (400, 16px, 1.5): the composer, dialog fields, search. Never below 16px on touch.
- **UI** (400/500/600, 14px, 1.45): chrome, rows, buttons (500), settings section titles (600), table cells, the phone header's project name (600).
- **Label** (500, 13px, 1.5; 400 for hint and help text): secondary lines, hints, the speaker label (600), the composer's model and thinking chips, segmented options, the sidebar's Pinned and Projects dividers (`ink-3`). Code is the same size in mono at 1.65.
- **Meta** (400, 12px, 1.5): timestamps, counts, badges, keyboard hints, tabular figures.
- **Micro** (600, 11px, 1.45): the queue ring numeral only.

**Text-size preference.** Small / Normal / Large set `--font-scale` to 0.92 / 1 / 1.14 on `<html>`, and every size token above is `calc(Npx * var(--font-scale))`. Input is `max(16px, 16px * scale)`, so Small never reaches the composer. Sizes are px, not rem, so the shell does not move with the browser root size.

### Named Rules
**The 16-Floor Rule.** Any text field a thumb can focus is 16px or larger, or iOS Safari zooms the viewport and never zooms back. The only step down is the sidebar's filter and rename fields on `pointer: fine`, which drop to 14px; touch stays 16.

**The Sentence-Case Rule.** Labels, section dividers and speaker names are sentence case at label size in `ink-2` or `ink-3`. There is no uppercase, no letter-spacing and no eyebrow style anywhere in the system.

**The Numbers Align Rule.** Anything that ticks or sits in a column sets `tabular-nums` (timers, counts, times, table cells); a table column whose every filled cell is numeric is right-aligned.

## Layout

A permanent project sidebar and a single centred thread column; everything else is an overlay.

- **Shell.** `h-app` (`var(--app-height, 100dvh)`), `overflow-hidden`, flex. Sidebar column from `lg` (1024px), 272px wide on `canvas`. Below `lg` the same sidebar is a drawer, `min(300px, 84vw)`, that slides in from the left (250ms, `ease-drawer`) over a scrim.
- **Header.** 52px row (`h-13`) under a `pt-safe` inset, three columns (menu, title, actions) so the title stays optically centred on a phone and sits left on desktop. 40px icon buttons with a 44px hit area; 6px edge padding (8px at `lg`). On a phone the project name stacks over the chat name (14px 600 over 12px 500 `ink-2`); from `sm` they share one line at 17px separated by a middle dot.
- **Thread.** `max-w-3xl` (768px), centred, `px-safe` (16px minimum, or the notch inset), 20px top and 24px bottom padding. Turns are separated by 28px, and 36px from `sm`. Inside an assistant turn, blocks are 16px apart and the speaker label sits 6px above the body. User turns are inset 40px from the left edge (64px from `sm`).
- **Composer.** Shares the 768px column and gutters; `pb-safe` is `max(8px, var(--safe-bottom))` — the home-indicator inset less any measured web-view shortfall (see CLAUDE.md, shell height); a 32px page-colour fade sits above it so the thread dissolves rather than cuts.
- **Settings.** A separate route, `max-w-2xl` (672px), same header height. Sections are 36px apart; rows are 14px tall padding with hairline dividers and stack the control under the label on a phone.
- **Spacing rhythm.** Tailwind's 4px base. Recurring steps: 4, 6, 8, 10, 12, 16, 20, 28, 36. Row padding is 10px horizontal; card padding 16px; dialog padding 20px; popover padding 6px.
- **Touch.** Anything drawn smaller than 44px gets a transparent `tap-target` pseudo-element, centred, so the glyph is not inflated. Hover-only affordances (row menus, message actions) are always visible on touch and revealed on hover for `(hover: hover)`.

### Named Rules
**The Measured Shell Rule.** The shell's height is measured, not declared: `window.innerHeight` becomes `--app-height`, and `h-app` reads it. `dvh` and `visualViewport` are never the source.

**The One Column Rule.** Reading and composing share one centred 768px column. Wide content (tables, code, commands) scrolls inside its own box instead of widening the column.

### iOS-shaped rules that are design constraints
- **The shell is sized from `window.innerHeight`, never `dvh` and never `visualViewport`.** The pre-paint `APP_HEIGHT` script in `layout.tsx` writes `--app-height`. iOS 26 overreports `dvh` and WebKit pans rather than resizes for the keyboard.
- **The composer is plain `relative`, not `sticky` or `fixed`**, and bottom-anchored overlays (search, new-project and new-chat dialogs, menus, sheets) are `fixed inset-x-0 top-0 h-app`, not `inset-0`.
- **Every top-level surface pays the status bar itself** (`pt-safe`), because the status bar is `black-translucent`. Bottom surfaces pay `pb-safe`, side insets come from `px-safe`.
- **The pre-paint `NO_FLASH` script mirrors `applyPrefsToDocument()`** (theme class, `colorScheme`, text size, reduce-motion). Change one, change both.
- **Chrome is not selectable and has no tap highlight**; only the transcript (`data-selectable`), inputs and textareas opt back in. Pinch-zoom stays enabled.
- **Keyframes live at the top level of `globals.css`, never inside `@theme`**, because every animation is applied by inline `style` that Tailwind's scanner cannot see.

## Elevation & Depth

A hybrid that leans tonal. Dark depth is value: the grey ladder does the separating, with a barely-there white ring (6 to 8%) on raised surfaces and a deep soft drop only where something floats. Light depth is a hairline ring plus a faint drop. Shadows are composites defined per theme as CSS variables so `.dark` can redefine them; surfaces are flat at rest.

### Shadow Vocabulary
- **Hairline / card** (`--shadow-card`, dark `0 0 0 1px oklch(100% 0 0 / 0.07)`, light `0 0 0 1px var(--line)`): cards, code blocks, queued rows, starter chips. A ring and nothing else.
- **Button** (`--shadow-btn`, dark `0 0 0 1px oklch(100% 0 0 / 0.1), 0 1px 2px oklch(0% 0 0 / 0.3)`, light `0 0 0 1px var(--line-strong), 0 1px 2px oklch(0% 0 0 / 0.04)`): secondary pills and the active segmented option.
- **Raised** (`--shadow-raised`, dark `0 0 0 1px oklch(100% 0 0 / 0.06), 0 6px 20px -4px oklch(0% 0 0 / 0.35)`, light `0 0 0 1px oklch(0% 0 0 / 0.08), 0 4px 16px -2px oklch(0% 0 0 / 0.06), 0 1px 3px oklch(0% 0 0 / 0.04)`): the composer and the jump-to-latest button, so they float over the thread.
- **Overlay** (`--shadow-overlay`, dark `0 0 0 1px oklch(100% 0 0 / 0.08), 0 14px 36px -6px oklch(0% 0 0 / 0.55), 0 2px 8px oklch(0% 0 0 / 0.25)`, light `0 0 0 1px oklch(0% 0 0 / 0.08), 0 12px 32px -4px oklch(0% 0 0 / 0.14), 0 2px 6px oklch(0% 0 0 / 0.05)`): menus, popovers, dialogs, the drawer, toasts.
- **Inset field** (`inset 0 0 0 1px var(--line)`; fields use `--line-strong`, and `--ink-3` on focus): text inputs are drawn as an inset ring, not a border.

### Named Rules
**The Flat-At-Rest Rule.** Beyond a 1px ring and the faint contact shadow under secondary buttons, only the composer, the jump-to-latest button and overlays cast a drop. Rows, bubbles and assistant prose carry no shadow and no border.

## Shapes

Soft, rounded, and consistent by role; the tiers are tokens in `@theme`.

- **Composer 28px** (`rounded-composer`): the pill. Its controls inside are full-radius circles.
- **Bubble 22px** (`rounded-bubble`): the user message. The contract named 24; the build ships 22.
- **Dialog 20px**: new-project and new-chat dialogs. Written as a literal `rounded-[20px]` in two files, not yet a token, and one step above the contract's 16 for cards and popovers.
- **Card and popover 16px** (`rounded-card`, `rounded-popover`): approval, recommendation and queued cards, code blocks, menus, the composer menu, the desktop search palette.
- **Control 10px** (`rounded-control`): sidebar and menu rows, icon buttons, text fields, small inline buttons.
- **Chip 8px** (`rounded-chip`): capability chips, "active" and "on / off" tags, and hint tags inside rows and menus.
- **Full** (`rounded-full`): every pill button, the send, stop and attach circles, segmented tracks and options, switches, badges, toasts, status dots.
- **Borders.** Almost none. Separation is a ring shadow, a hairline divider (`border-line`) or value. The one border-left is the 2px `line-strong` rule on blockquotes.
- **Icons.** Inline SVG, 24 viewBox, 2px stroke (2.2 on chevrons), round caps and joins, `currentColor`. Sizes by place: 20 header, 18 sidebar rows and composer, 14 to 16 in menus and message actions, 12 to 13 in tool rows.

**The Role Radius Rule.** Radius follows role, not size: pills for actions, 10px for rows and fields, 16px for containers that hold content, 22px for a bubble, 28px for the composer. A new surface picks the tier of what it is.

## Components

### Header
Quiet and borderless on the page colour: 52px, menu button left (below `lg`), title, then an overflow menu and the pencil. The pencil means the narrow thing, "new chat" for this project, and confirms first. A pulsing run dot (8px, `ink-2`, `orange` while waiting) sits beside the title and is the only at-a-glance live-run signal once the thread has scrolled; idle draws nothing.

### Sidebar
- **Rows** are 36px, `rounded-control`, 14px, `ink-2` at rest, `hover` wash on hover, `hover-2` plus `ink` when active. An open project defers the highlight to its active chat row, so two rows never read as selected.
- **Structure.** Wordmark at 17px 600, then two action rows (New project, Search with a shortcut hint), an optional filter field when there are more than six projects, a scrolling nav with "Pinned" and "Projects" dividers (13px 500 `ink-3`), and Settings pinned at the foot. Project tiles are 24px rounded-7 squares on `field` with an emoji or initial; branches indent 16px per level with a branch glyph.
- **Unread** scheduled reports are an `accent` dot on the project and a `accent-tint` count pill on the Scheduled row; both hue-free.
- **Status dots** (`StatusDot`, 8px) on every chat and collapsed project, from the activity snapshot: `orange` pulsing while an approval waits, `orange` steady for an open question, `ink-2` pulsing while running, `red` for a failed run nobody has opened, `accent` for an unseen reply. The open chat uses its own `RunDot`.

### Notifications
A 40px bell left of the header menu, its count in a 16px `accent` pill (`page` text, 11px 600, `tabular-nums`) at its top-right. The panel is the whole screen on a phone and, from `sm`, a 400px popover hung under the bell (`raised`, `rounded-popover`, `shadow-overlay`, `pop-in` from the top-right), at most 70vh. A 48px header: 17px 600 "Notifications", a ghost "Mark all read" when anything is unread, a close button. Rows are divided by `line` hairlines: a 16px mark (orange `StatusDot` for an approval, an orange question glyph, `red` dot for a failure, a clock for a report, a bell for a reply), "Project · chat" at 13px (500 `ink` when unread, `ink-2` when read) with an `ink-3` relative time, an optional 14px title, a 2-line 13px body (mono for an approval's command), and an 8px `accent` unread dot. Questions and approvals carry their actions as 32px secondary pills under the row; Deny is secondary-danger.
### Messages
- **User bubble.** Right-aligned, `raised` (dark) or `#f4f4f4` (light), 22px radius, 16px / 1.55, `px-4 py-2.5`, no outline. Attachments sit above it; recovered file chips below.
- **Assistant prose.** No bubble. A 13px 600 `ink-2` speaker label in sentence case, then full-width 16px prose in `ink`. Lists indent 24px with `ink-2` markers, task items get a 14px rounded-4 check box, blockquotes a 2px `line-strong` rule at `ink-2`. Inline code is mono at 0.875em on `field`. A message still waiting on an approval eases to 85% opacity; it does not blur or shrink.
- **Actions.** A quiet row beneath each turn: copy, share, edit, retry, time. 16px icons in 32px `ink-2` buttons, `-mx-2` so the glyphs align to the text edge; hidden until hover on a pointer device, always dim-visible on touch; the last turn's Retry stays visible.
- **Day separator.** A centred 13px 500 `ink-3` label ("Today").

### Tables
Wide tables scroll inside their own box (`scroll-area scroll-fade-x`), so they never widen the thread. 14px, `tabular-nums`; header 600 with a `line-strong` underline, rows with `line` dividers, cells `px-3 py-2`, first and last cell flush to the column edge. A column whose filled cells are all numeric (`$`, `%`, digits, separators) right-aligns; an explicit `---:` wins. The scroll cue is CSS only: a 24px shade at whichever edge has more content, hidden by 48px opaque `local` covers at the ends; `--fade-bg` names the surface behind (`page`, or `inset` inside a code block).

### Code block
`rounded-card` on `inset` with a card ring. A 40px bar with the language in mono 12px `ink-3` and a Copy button (`rounded-control`, turns `green` for 1.5s once copied). Code is mono 13px / 1.65, `px-4`, horizontally scrolling with the fade cue, no line-number gutter.

### Composer
A pill: `raised`, 28px radius, 8px padding, `shadow-raised`, two rows. Row one is the textarea (16px, `px-2.5 py-2`, min 40px high, transparent, no ring of its own). Row two is attach (36px circle, left), then the model chip and thinking chip (13px `ink-2`, full-radius ghost buttons), then send. While a run is live, a 36px **stop** circle (`field` ground, `ink` square) appears beside send with a pop-in, and send stays usable to steer; a 12px hint says "steers the run" or "queues next". Send is an `ink` circle with a `page`-colour arrow, and goes to `field` with an `ink-3` arrow when empty. A new error shakes the pill once (400ms).

### Buttons
Pills (`rounded-full`), 14px 500. Medium is 40px with 16px padding (dialog footers); small is 36px with 14px padding (inside rows and cards).
- **Primary:** `ink` on `page`; hover drops to 90% opacity.
- **Secondary:** `ink` text with the button ring, hover wash.
- **Danger:** `red` fill with white text; **secondary-danger** and **ghost-danger** carry `red` text only.
- **Ghost:** `ink-2`, hover wash and `ink`.
- **Press:** scale 0.97 over 150ms; disabled is 40% opacity. Icon buttons: 36px (dialog close) or 40px (header), `rounded-control`, `ink-2`, hover wash; circle controls in the composer press at 0.94.

### Fields
`h-10`, `rounded-control`, transparent ground, 16px text, drawn as an inset ring (`line-strong`) that shifts to `ink-3` on focus; placeholder `ink-3`. Text fields suppress the keyboard focus outline (the ring shift and the caret are the focus signal); all other controls get the 2px `accent` outline at 2px offset on `:focus-visible` only. Labels are 13px 500 `ink-2` above; help is 13px `ink-3` below.

### Cards
`rounded-card`, `raised`, card ring, 16px padding, `fade`/`pop-in` entry. Used for the approval card, the recommendation or question card and queued rows.
- **Approval:** a 14px 600 title, a "Waiting" badge (`orange-tint` ground, `orange` text, pill) or "Blocked" (`red` ground, white text, whole card on `red-tint`); the agent's description at `ink-2`; the command in a mono 13px `inset` well with a hairline, capped at 160px and scrolling; the persisted pattern key in a mono chip; choices as 40px rows with a 20px round glyph; an "apply to all" check row. It sits directly above the composer, capped at 45dvh and scrolling in its own right.
- **Recommendation / question:** a 24px round icon (orange tint for a question, neutral tint for a recommendation), 14px 600 title, `ink-2` rationale, an optional confidence meter, and one full-width 40px pill per action (first is primary, the rest secondary). Old turns' cards render as inert labels.
- **Queued:** a numbered 22px ring, one-line text, a "Queued" pill on `inset`.

### Popovers and menus
`raised`, 16px radius, 6px padding, `shadow-overlay`, min width 216px. They open from their trigger and are anchored to it: a header menu drops down (`top-full`, 6px gap), the composer's menus open upward (`bottom-full`, 8px gap) and the thinking menu aligns to the chip's left edge. Entry is `pop-in` with the transform origin at the trigger corner. Items are 36px, `rounded-control`, 14px, a 16px `ink-2` icon, an optional right-aligned 12px `ink-3` hint; danger items are `red`. A transparent full-screen layer catches the dismissing tap. Arrow keys rove focus; Escape closes and returns focus to the trigger.

**The Anchored Overlay Rule.** An overlay opens from, or is anchored to, the thing that summoned it: menus from their trigger, the thinking menu from its chip, the composer menu from the composer, dialogs bottom-anchored on a phone. Nothing floats at an arbitrary position.

### Dialogs and sheets
- **Dialog.** Bottom-anchored on a phone, centred from `sm`; `rounded-[20px]` on `raised`, `shadow-overlay`, `max-w-md` (`max-w-sm` for confirms). Title 17px 600 with a 36px ghost close, body 14px `ink-2`, 20px padding, a pill footer right-aligned (secondary then primary). The body scrolls and the footer stays pinned. It confirms before any action that discards continuity.
- **Sheet.** A left-edge panel on `canvas`, `88vw` up to 420px, owning the top, bottom and left insets, slid in at 200ms; scrim tap or Escape dismisses and body scroll is locked.
- **Search.** The whole screen on a phone; from `sm` a 576px palette at 12vh on `raised`.

### Settings
Sections are a 14px 600 title, optional 13px `ink-3` description, then rows divided by hairlines. A row is a 14px label with a 13px hint on the left and its control on the right (stacked under the label on a phone when the control needs the width, 288px wide from `sm`).
- **Segmented control:** a full-radius `field` track, 2px padding, 32px options at 13px; the active option is `page` on light, `hover-2` on dark, with the button ring and weight 500.
- **Switch:** 44 x 26px; on is an `ink` track with a `page` knob, off is a `line-strong` track with a white knob. The knob translates 18px over 200ms.
- **Status:** an 8px dot plus mono 13px value (reachable / offline); capability chips use the `chip` shape.

### Run status
- **Tool rows.** A collapsible "N tool calls" header (13px `ink-2`), then 32px rows: icon, mono 13px 500 tool name (identifiers are data, so they are mono), a mono 12px `ink-3` preview, and a status mark. Running is a 12px spinner ring; done is an `ink-3` check; failed is an 8px `red` dot. Detail expands under a 1px `line` rule.
- **Run dot, run status line, thinking chip.** Neutral by default; the status line pairs a 9-pixel loader with a label and an elapsed timer in mono `ink-3`.
- **Toast.** One at a time, 44px pill on `raised` with `shadow-overlay`, a `red` dot for an error, an inline action and a dismiss; it rises in 200ms.
- **Approval attention.** Arriving from the approval's notification, the card takes a 2px `orange` outline (an outline, because `shadow-card` owns box-shadow) that fades over 300ms after ~1.6s, and its first choice takes focus.

### Project panels
Files and What changed are sheets; What changed uses the `wide` sheet (760px) because a diff reads in columns. Files: 48px rows with a 40px thumbnail or file tile, name, and `ink-3` size · age. What changed: a mono summary (branch, counts in `green`/`red`), then 40px file rows with a 20px status letter chip, mono path (directory in `ink-3`), +/− counts and a disclosure chevron; a patch expands into an `inset` well, mono 12px, added and removed lines on `green-tint` / `red-tint`, scrolling sideways in its own box. Bring in a chat is a dialog (`max-w-md`) with a filter field and two-line rows (title, then `ink-3` source · messages · age).

### Motion grammar
Short ease-out fades and small rises; panels slide; nothing bounces. Durations are tokens (`--duration-micro` 80, `quick` 150, `fast` 200, `medium` 250, `slow` 300ms); easings are `--ease-out-strong` `cubic-bezier(0.23, 1, 0.32, 1)` for anything entering, `--ease-drawer` `cubic-bezier(0.32, 0.72, 0, 1)` for the drawer, plus `--ease-smooth-out` for the run dot and `--ease-link` for the link underline. Nothing eases in.
- **Entrances:** `fade-up` (8px rise) for turns, tool rows and sections (250 to 300ms); `fade-in` for scrims and notes (150ms); `pop-in` (scale 0.95 to 1) for menus, cards, the stop button and dialogs (150 to 200ms); `toast-in` (10px rise, scale 0.97) for toasts; `panel-in-right` for the drawer (250ms) and the sheet (200ms).
- **Disclosure:** tool calls, thinking and similar blocks expand by animating `grid-template-rows` 0fr to 1fr with opacity, 300ms `ease-out-strong`; chevrons rotate 150 to 300ms.
- **Press:** `transform: scale()` on `:active` over 150ms (see Buttons); hover is a colour or wash change, never movement.
- **Status loops:** the run dot pulses (1.4s), the tool spinner turns (700ms), the stream caret blinks (1s, stepped), the 3x3 loader grid pulses (650ms).
- **Reduce motion** (the in-app switch or the OS setting, merged onto `<html data-reduce-motion>` before paint): the duration tokens go to 0ms and transitions to 0ms, which silences every entrance because they all read the tokens. Looping status indicators spell their durations out literally and are meant to keep running, since a frozen spinner reads as a hung run.

## Do's and Don'ts

### Do:
- **Do** separate dark surfaces by value: #0b0b0b sidebar, #141414 page, #252525 raised, and keep the ring on raised surfaces at 6 to 8% white.
- **Do** keep hue for states that ask something of the reader: `orange` for waiting, `red` for failure and destructive actions. Show running with the neutral pulsing dot.
- **Do** make the primary action an ink-on-page pill and every other action a ghost or ring-secondary pill.
- **Do** use the type tokens (`text-meta`, `text-label`, `text-ui`, `text-body`, `text-input`, `text-title`) and never an arbitrary pixel size, so the text-size preference moves everything together.
- **Do** keep text fields at 16px on touch, and keep sizes in px so the shell ignores the browser root size.
- **Do** size the shell with `h-app`, pay `pt-safe` / `pb-safe` / `px-safe` on every edge surface, and anchor overlays with `inset-x-0 top-0 h-app`.
- **Do** declare every animation through a top-level keyframe and a duration token (`--duration-quick` 150, `--duration-fast` 200, `--duration-medium` 250, `--duration-slow` 300) with `--ease-out-strong` (`cubic-bezier(0.23, 1, 0.32, 1)`); use `--ease-drawer` (`cubic-bezier(0.32, 0.72, 0, 1)`) for anything that slides in from an edge.
- **Do** give every control a press response: scale 0.97 for buttons, 0.96 to 0.94 for small icon and circle controls, 0.98 to 0.99 for rows.
- **Do** put a 44px `tap-target` on anything drawn smaller, and reveal hover-only actions permanently on touch.
- **Do** build generated Markdown as React elements only; user text stays literal.
- **Do** keep tool names, paths and command text in mono and everything else in the UI face.

### Don't:
- **Don't** use `dvh` or `visualViewport` to size the shell, `sticky` or `fixed` for the composer, or `fixed inset-0` for a bottom-anchored overlay.
- **Don't** tint completed, enabled or ordinary-success states, and don't add a brand hue to buttons or links.
- **Don't** add outlines to raised surfaces in dark, or drop shadows to rows, bubbles or prose.
- **Don't** add uppercase, tracked or eyebrow labels, gradient text, glyph characters standing in for icons, or a web font.
- **Don't** declare keyframes inside `@theme`, run an entrance or transition longer than 300ms, add bounce, or put a filter or blur over long text (it was removed from the resolving state because it repaints on a phone). Looping status indicators are the only animation allowed to run longer.
- **Don't** widen the thread past 768px; wide tables and code scroll inside their own box instead.
- **Don't** edit the `NO_FLASH` pre-paint script without matching `applyPrefsToDocument()`.
- **Don't** let a hue appear only in colour: pair it with a label or shape (the Waiting and Blocked badges carry text).
