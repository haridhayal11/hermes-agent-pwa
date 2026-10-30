# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who run their own [Hermes Agent](https://hermes-agent.nousresearch.com/docs/)
gateway and want to drive it away from the terminal. The app is installed by
other Hermes users, so nothing is tied to one deployment.

They use it about equally in two scenes:

- **On the phone** (installed to the iPhone home screen): send a long task, lock
  the phone, come back when a push notification arrives; answer an approval;
  read a scheduled report. Often one-handed, often brief.
- **On the Mac** (installed PWA window at a desk): long working sessions in a
  project thread, reading long answers, code, tool output and files.

## Product Purpose

A mobile-first command center for a self-hosted Hermes Agent. Success is that a
project thread is something you return to for weeks, and that nothing is lost
when the phone locks mid-run: the full transcript, live status and any pending
approval are there when you come back.

## Positioning

One durable chat per project rather than a new chat per session, backed by a
middle tier on the agent's own host that holds the single upstream event stream
and replays it to any device. That is what survives the lock screen and makes
completion pushes possible. It is deliberately not a clone of the Hermes
dashboard.

## Operating Context

- Reached only over the user's tailnet (`tailscale serve` HTTPS), on iOS 16.4+
  and desktop browsers; installed as a PWA on both.
- Projects hold a working directory, standing instructions, model, linked
  skills, and a tree of durable chat sessions (roots and forks).
- Runs stream live, can be stopped, steered, and paused on approval requests;
  messages sent during a run queue.
- Hermes cron jobs report into one General chat, as plain messages you can
  reply to; a prompt in any chat can be turned into one ("Repeat this…").
- A bell in the header opens the notifications panel: approvals and open
  questions first, then replies that finished while you were away, failures
  and scheduled reports. Questions and approvals can be answered from it.
  The sidebar carries the same state as dots, and the app icon the count.
  The app opens on a chat — the pinned project, else the latest.
- Per project: the files the agent handed over, a read-only diff of its
  working directory, an export of the thread, and sessions from the CLI or
  Telegram brought in as chats.
- Web Push on completion, approval, question and scheduled report, chosen per
  device.
- A native Android client exists separately (`android/`) against `/api/v1`;
  this record covers the web app.

## Capabilities and Constraints

- The browser talks only to this app's routes, never to the Hermes API.
- Attachments: images inline, other files written to the host and named by
  path. Files come back by path through an allowlist.
- Search covers project names, instructions and opening prompts only; message
  bodies live in Hermes, which has no search endpoint, and the UI says so.
- Slash commands are catalogued client-side; unavailable ones explain
  themselves rather than spending a turn.
- Generated assistant output is Markdown, rendered to React elements only
  (never agent-supplied HTML); user text stays literal.
- Per-device preferences (theme, text size, tool-call detail, reduced motion)
  live in `localStorage`; the agent's display name is server-side.
- iOS-specific constraints are load-bearing and documented in `CLAUDE.md`:
  shell height from `window.innerHeight`, no `fixed`/`sticky` drift-prone
  positioning for the composer and bottom overlays, 16px minimum input text,
  safe-area insets, no tap highlight.

## Brand Commitments

- App name comes from `src/lib/branding.ts` (`APP_NAME`); the agent's name is
  the user's to choose.
- Dark is the default theme; light remains available, as does following the
  system.
- Visual direction (chosen 2026-10-28 over three distinctive worlds): the
  category standard, played straight. The web app should sit alongside the
  ChatGPT app and be judged against its craft — familiar chat conventions over
  a distinctive world, with no smuggled quirk.

## Evidence on Hand

- Real product copy throughout the components; no testimonials, customers or
  benchmarks exist and none should be invented.
- App icons in `public/` and `src/app/` (icon, apple-icon, maskable).

## Product Principles

1. Reading comes first: long agent answers, code and tool output must be easy
   to read; nothing decorative competes with them.
2. State at a glance: a live run, a pending approval, an open question and an
   unread scheduled report must be visible without hunting — the bell, the
   badge and the sidebar dots.
3. Light on the phone: no added weight, effects or motion that make the
   installed app slower or jankier on iOS.
4. Continuity over novelty: the one destructive action (pointing a project at
   a fresh session) confirms first; everything else preserves the thread.
5. Honest about limits: when Hermes cannot do something, the UI says so.

## Accessibility & Inclusion

- Pinch-zoom stays enabled; 44px touch targets on drawn-smaller controls.
- Text size preference (small / normal / large) and a reduced-motion
  preference that also honours the OS setting.
- Keyboard shortcuts on desktop; focus rings for keyboard focus only.
