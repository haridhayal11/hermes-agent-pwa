# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Hermes PWA — an installable mobile-first command center for a self-hosted
[Hermes Agent](https://hermes-agent.nousresearch.com/docs/). It is deliberately
**not** a clone of the Hermes dashboard, and it is meant to be installed by
other Hermes users, so nothing is hardcoded to one deployment.

The app's own name lives in `src/lib/branding.ts` (`APP_NAME`, plus the
`APP_SLUG` that keys `localStorage`, the data directory, notification tags and
upload folders — deliberately a constant, since all of those are durable
state). What the *agent* is called is the user's to choose: it is stored
server-side in `app_settings`, edited under Settings → Agent, read in the
browser through `AgentNameContext` and on the server through
`getAgentName()`. It is not a preference, because push payloads are composed
in Node where there is no `localStorage`, and because an agent answering to a
different name on the phone than on the Mac would be two agents. The root
layout reads it from SQLite and hands it down as a prop, which is why it is
`force-dynamic`.

The organising idea is **one durable chat per project**, not a new chat per
session. A project is a long-lived thread you return to for weeks.

The header's pencil is "new chat", and it means the narrow thing: point *this*
project at a fresh Hermes session, keeping its name, instructions, skills and
id (`POST /api/projects/[id]/reset`, `NewChatDialog`). It confirms first,
because it is the one action that discards continuity. A new *project* is the
sidebar's `+`, and only that.

```
iPhone / Mac PWA  (installed, https://<node>.<tailnet>.ts.net)
      ↓ tailnet-only HTTPS
Next.js app on the Hermes node  ← UI + route handlers + SQLite
      ↓ localhost, Bearer API_SERVER_KEY
Hermes API server :8642
```

## Commands

```bash
pnpm dev            # dev server (Turbopack is the default in Next 16)
pnpm build          # next build
pnpm start          # production server
pnpm lint           # eslint — CI-equivalent is: npx eslint src --max-warnings=0
pnpm typecheck      # next typegen && tsc --noEmit (bare tsc lacks the route types)
pnpm test           # vitest — unit tests beside their modules in src/lib
pnpm openapi:check  # every /api/v1 route is in docs/api/v1/openapi.json
```

The vitest suite covers the pure parts (migrations, DTOs, parsing, profile
routing). The streaming path is verified by running the app against a live
Hermes instance — see "Verifying against a real Hermes" below.

Search is `/api/search`, over our own SQLite only: project names, project
instructions, and each run's opening prompt. Message bodies live in Hermes,
which has no search endpoint, and the UI says so rather than implying
otherwise.

`next lint` was removed in Next 16 and `next build` no longer lints; run
eslint separately.

## Why the middle tier exists

This is the single most important thing to understand before changing the
streaming path.

Hermes' `GET /v1/runs/{id}/events` is a **single-consumer, non-replayable
queue that is destroyed on disconnect** — the handler pops the stream registry
entry in a `finally`, and unconsumed buffers expire after five minutes. A
phone cannot be that consumer: iOS suspends the tab on lock and the run's
event stream would be gone permanently.

So `src/lib/run-manager.ts` holds **exactly one** upstream connection per run,
from localhost, and persists every event to SQLite with a monotonic `seq`. The
browser subscribes to *our* stream instead, which replays from `?after_seq=N`
and then goes live. That is what survives lock screen, backgrounding and
network changes — and because the backend sees `run.completed` whether or not
anyone is watching, it is also the only reason push notifications are possible.

Never make the browser talk to `:8642` directly.

## Layout

| Path | Role |
|---|---|
| `README.md` | The public front page. |
| `PRODUCT.md` | Who the app is for and the product principles any UI work answers to. |
| `DESIGN.md` | The visual system as built: tokens, type, components, named rules. `.impeccable/design.json` is its machine-readable sidecar. |
| `SETUP.md` | The install runbook, addressed to an agent doing it for its user. |
| `src/lib/branding.ts` | `APP_NAME` and `APP_SLUG`. No imports, so either side can read it. |
| `src/lib/app-settings.ts` | Install-wide settings in SQLite — currently just the agent's name. |
| `src/components/AgentNameContext.tsx` | The agent's name on the client, seeded from the root layout. |
| `src/components/LaunchNormalizer.tsx` | Sends a cold launch of the installed app to `/` — iOS pins the icon to whatever URL you installed from. Mounted in the root layout, so `/settings` is covered too. |
| `src/lib/hermes.ts` | Typed client for `:8642`. The only place `HERMES_API_KEY` — and any profile's key — is read. `hermes` is the default profile; `hermesFor(profile)` is the `/p/<profile>/` mirror. |
| `src/lib/bots.ts` | Bot Mode: the profile roster (read off disk, probed over HTTP), Bot Chat resolution, and `hermesForProject()`. |
| `src/components/ProjectBotContext.tsx` | The open project's Bot on the client: scopes the skill/model/toolset catalogues and the agent's name. |
| `src/lib/run-manager.ts` | Owns runs, the upstream SSE connection, the event log, the queue, and the push-on-completion hook. Singleton pinned to `globalThis` (HMR would otherwise open a second upstream connection per run). |
| `src/lib/api/v1/**` | Stable native-client boundary: device auth, public DTOs and idempotent writes. |
| `src/app/api/v1/**` | Versioned, bearer-authenticated routes for native clients. Pairing claim is the only public exception. |
| `docs/api/v1/openapi.json` | Source of truth for the native HTTP and SSE contract. |
| `android/` | Fully native client; never a place to embed the host stack. |
| `src/lib/db.ts` | better-sqlite3 handle + idempotent column migrations. |
| `src/lib/instructions.ts` | Composes the per-run system prompt; project templates. |
| `src/lib/preferences.ts` | Per-device display prefs and their `localStorage` shape. |
| `src/lib/push.ts` | Web Push / VAPID. The only place the private key is read. |
| `src/lib/uploads.ts` | Where attachments land, and the download allowlist. |
| `src/lib/activity.ts` | What is happening across every project — approvals, live runs, unseen replies, unread reports — for Home, the sidebar's dots and the app badge. Database only, so `push.ts` can count the badge. |
| `src/lib/run-text.ts` | Reads over a run's event log (reply text, preview, pending approval command). Database only; shared by run-manager, activity and push. |
| `src/components/ActivityContext.tsx` | The activity snapshot on the client. Mounted in the root layout so it survives navigation; sets the app badge. |
| `src/components/home/HomeView.tsx` | `/`: Needs you, Running, New replies, Scheduled, Projects. |
| `src/lib/shell-data.ts` | The projects + sessions every AppShell page renders the sidebar from. |
| `src/lib/project-files.ts` | The Files panel's listing: the outbox and the upload folders, never the whole cwd. |
| `src/lib/git-changes.ts` | "What changed": a hardened, read-only `git status`/`git diff` of the project's cwd. |
| `src/lib/transcript-export.ts` | `/save` and Export chat: the full transcript as Markdown or JSON. |
| `src/lib/commands.ts` | The composer's `/` catalogue and its client-side dispatch. |
| `src/lib/cron-watcher.ts` | Watches Hermes' cron jobs and delivers their output into the General chat. Singleton, started from `src/instrumentation.ts`. |
| `src/lib/general-chat.ts` | Lookups for General, the one-chat project every bound job reports into. Database only, so anything can import it. |
| `src/lib/general-chat-setup.ts` | Creates General on first need (single-flight), and the one-time migration that retired the per-project Scheduled inboxes. |
| `src/lib/notification-kinds.ts` | The push vocabulary, importable from the client — `push.ts` is not, it pulls in web-push and SQLite. |
| `src/app/api/**` | Route handlers. The browser only ever calls these. |
| `src/app/settings/**` | The app-wide settings page. |
| `src/components/chat/**` | Thread UI, adapted from beautifului.dev. |
| `src/hooks/useThread.ts` | The run state machine — every SSE event is decoded here. |
| `src/hooks/useShortcuts.ts` | Desktop keyboard shortcuts. Each owner registers its own bindings; unmodified keys never fire in a text field, and nothing fires while a dialog or menu is open. |
| `src/lib/markdown-blocks.ts` | Tokenises generated Markdown into blocks (headings, lists, quotes, tables). Produces data, never markup — `Message.tsx` builds the elements. |
| `src/lib/thread-messages.ts` | History rows → `ThreadMessage`, shared by the server loader and the post-run refresh. |
| `public/sw.js` | Service worker. Push only — no fetch handler, no precache. |

## Key invariants

**The native client never receives `HERMES_API_KEY`.** A host-issued one-time
code is exchanged for a per-device token under `/api/v1`; only its digest is
stored in SQLite. The unversioned browser routes retain the tailnet trust
model, while every v1 route except pairing claim requires device auth. Change
the implementation behind v1 freely, but keep its OpenAPI contract stable or
publish a new version.

**An event cursor is `(run id, sequence)`, never a sequence alone.** `seq`
starts over for every run. Native SSE ids use `<runId>:<seq>` and accept either
`Last-Event-ID` or `?cursor=` on reconnect. Applying the last sequence from one
run to the next silently drops the next run's opening events.

**Native actions are idempotent.** Project creation, messages, approvals and
stops require an `Idempotency-Key`; a successful JSON response is retained for
24 hours per device. A phone losing the response during a network handoff must
retry the same body and key rather than creating a second run or action.

**Zero-argument GET route handlers must export `dynamic = "force-dynamic"`.**
Next 16 prerenders a GET handler that never touches the request and serves the
build-time snapshot forever. This shipped as a bug: `/api/skills` served a
cached 404 in production. Any new no-arg GET proxying Hermes or SQLite needs
the same guard.

**Project instructions, not seed messages.** A project's framing lives in the
`instructions` column and is passed as Hermes' ephemeral system prompt on
*every* run. A pinned seed message is display-layer — it scrolls away and
compaction reduces it to whatever the summarizer kept. Re-sending means turn
500 is framed exactly like turn 1 at zero transcript cost.

`instructions` is **appended** to Hermes' own system prompt, not substituted
for it (`agent/chat_completion_helpers.py:2932` —
`effective_system + "\n\n" + ephemeral_system_prompt`). That is why
`composeInstructions()` can always return a string: an unconfigured project
still keeps the gateway's base prompt.

**Files come back by path, not by payload.** Hermes can receive an image and
nothing else, and `:8642` has no download endpoint at all — so the only way a
file reaches the phone is for the agent to write it somewhere this app will
serve and then name the path in its reply. `composeInstructions()` tells it
where (the project's outbox, `<data dir>/outbox/<project>/`), `FileLinks`
scrapes absolute paths back out of the message, and `/api/files` decides. The
allowlist is the whole security model: upload cache, outbox, and any project's
`cwd`. The agent proposes these paths and can write anywhere the gateway user
can, so "the model said so" is never evidence a path should be served — the
batch probe (`POST /api/files`) is what decides whether a chip renders at all.

The same scrape runs over user turns, which is what makes uploads durable:
`composeInput()` names every attachment path in the prompt text, images
included, so the thread rediscovers its own attachments after a reload — where
history comes back from Hermes as text and nothing else.

**Generated message formatting is an explicit contract.** `/api/v1` adds the
required `content_format` field after normalising Hermes history: assistant and
cron output is `markdown`, while user, system and tool text is `plain`. The web
thread and Android render only messages declared as Markdown; user-authored
text remains literal. On the web, block structure comes from `parseBlocks()` and inline
spans from `renderInline()`; both yield React elements, so there is still no
HTML path. Neither client renders agent-supplied HTML. Notification
previews use the shared plain-text projection because push surfaces cannot
render Markdown.

**Skills are linked by name, never inlined.** Hermes can preload a skill's full
text, but installed skills reach ~100KB — pasting one into every turn would
cost roughly 25k tokens a message. The instructions name the skill and tell the
agent to pull it in with `skill_view` when relevant.

**A completion notification reports the reply, not the prompt.** It used to
carry `runs.prompt_preview`, so finishing a run buzzed the phone with the text
the user had just typed — which reads as a notification *of your own message*
rather than of the answer. `replyPreview()` reassembles the reply from the
`message.delta` log instead, dropping fenced blocks first so a turn opening
with a code block doesn't notify with a brace. The prompt survives only as the
fallback on a failure, where there is no reply to quote.

The trigger is unchanged and still deliberate: unwatched, or longer than
`NOTIFY_AFTER_MS`. Sending from a phone and locking it is the ordinary case —
the stream drops, so the run is genuinely unwatched, and the notification is
the right call.

**The VAPID subject has to be a real URL.** It is contact metadata for the
push service and nothing is ever sent to it, which is why it spent a long time
as an unroutable `mailto:` on localhost. Apple validates the claim where Chrome and Mozilla
do not, and answers `403 {"reason":"BadJwtToken"}` — so on the one platform
this app is actually installed on, every notification was silently dropped. It
is `VAPID_SUBJECT` now, defaulting to the project repo. Any routable `mailto:`
or `https:` URL works; an unroutable one does not.

The symptom was invisible from inside the app because `sendToAll` returned only
a count, and "the push service refused it" and "nobody was subscribed" both
came back as zero. It reports `{sent, failed, error}` now, and
`POST /api/push/test` answers 502 with the push service's own reason rather
than a cheerful `{"sent":0}`.

**The shell is sized from the layout viewport, never `dvh` and never
`visualViewport`.** `--app-height` is written pre-paint by the `APP_HEIGHT`
script in `layout.tsx` from `window.innerHeight`, and `h-app`
(`globals.css`) is `var(--app-height, 100dvh)`.

Two different bugs meet here. iOS 26 overreports the dynamic viewport in an
installed web app, so `h-dvh` made the shell taller than the screen — and since
it is also `overflow-hidden`, the composer sat below the bottom edge with no
way to scroll to it. But the obvious correction, sizing off
`visualViewport.height`, is worse: WebKit *pans* the visual viewport to reveal
the caret when the keyboard opens rather than resizing the layout viewport, so
a shell shrunk to the visible height ends mid-pan and the composer lands at the
top of the screen. `window.innerHeight` is the one measurement that is both
correct and stable under the keyboard; the guards in the script — never shrink
while an editable element has focus, never shrink by a keyboard-sized fraction
— are for the iOS builds that shrink it anyway.

A third build gets it short instead. WebKit 301994, as it shows on iOS 26.5, gives a
Home Screen app a web view that stops 62pt above the bottom of an 874pt
screen: `innerHeight`, `100dvh` and `clientHeight` all read 812, and the
system paints the strip below itself — no element reaches it, so the shell
must **not** be stretched to `screen.height` (that is the composer-below-the-
edge bug again). What the same script does instead is measure
`--viewport-shortfall` and subtract it from the bottom inset: the short web
view never reaches the home indicator, so `env(safe-area-inset-bottom)`'s
34pt was dead space stacked on the system's strip. Every bottom-anchored
surface reads `--safe-bottom` (via `pb-safe`), never `env()` directly. The
shortfall is 0 unless the app is standalone, portrait, full-width, short by
no more than a status bar, *and* has a positive top inset — the 26.1 form of
the same bug went opaque with a 0 inset and lost its height at the top, where
the bottom padding is still needed.

The same iOS 26 release drifts `fixed`/`sticky` boxes off their computed
position, which is why the composer is plain `relative` — the `sticky bottom-0`
it used to carry was already a no-op inside a non-scrolling flex column, so it
bought nothing and cost that. Bottom-anchored overlays (`SearchOverlay`,
`NewProjectDialog`, `NewChatDialog`) are `inset-x-0 top-0 h-app` rather than
`fixed inset-0` for the same reason.

**iOS pins the home screen icon to the URL you installed from.** Safari's Add
to Home Screen ignores the manifest's `start_url` — so the icon ends up bolted
to whichever project was open when it was installed (nearly always one, back
when `/` redirected into the most recent project), and 404s if that project is
later deleted. `/` is Home now, which is what the correction lands on. `LaunchNormalizer` corrects it on
the way in: a *cold launch* of the installed app (session-storage marker,
`navigate` navigation type, `display-mode: standalone`) is replaced with `/`.

The trap is the notification deep link, which is also a cold launch. `sw.js`
appends `?n=1` in its `openWindow` branch — the branch that runs only when no
window exists — and the normalizer treats that as "leave it alone" and strips
the marker. Anything else that opens a window from outside has to do the same.

**Preferences are per device, in `localStorage`.** There is no settings table
and there deliberately isn't one: theme, text size and how much of a tool call
to show are properties of the screen in front of you, not of the account. The
consequence is that anything the *server* has to decide cannot read them —
which is why run-manager's "notify after 60s / when nobody is attached" rule is
a server-side constant and the client pref only governs whether this device
holds a push subscription at all.

Which *kinds* of notification a device wants is the one thing that has to be
both server-side and per device, because the Node process is what decides
whether to send. It is stored as `push_subscriptions.kinds_json` — on the
subscription row it governs — rather than in a settings table, so the rule
survives intact: NULL means every kind, which is what a subscription created
before the switches existed has to keep meaning.

**The open session is client-local navigation state.** The PWA route and the
native view model decide which chat is visible. Selecting a session must not
write `projects.session_id` or emit a navigation event: doing that made a tap
on Android replace the route in every open browser. The legacy `/select`
routes remain for compatibility, but native row taps do not call them or
refresh the shared tree. Explicit session IDs are required for session-specific
actions. Opening a project without one resolves its most recently active
ordinary chat; stored
project session pointers are legacy compatibility fields, not navigation
authority.

`layout.tsx` writes the theme, text size and reduce-motion flags onto `<html>`
from a blocking inline script, before React (and `--app-height` alongside it). It duplicates
`applyPrefsToDocument()` on purpose — a module import runs after first paint,
and every cold start would flash the wrong palette. Change one, change both.

**`runs.status` is kept current, and a run is news until it is seen.** The
column moves `queued` → `running` (when our upstream stream attaches) ↔
`waiting_for_approval` → terminal. For a long time it went straight from
`queued` to terminal, so nothing server-side could say "this is waiting on
you" — and the 60s approval reminder, which re-checks the status, never fired.
Settled `completed`/`failed` runs are *unseen* until the thread is open and
**visible** (`POST …/sessions/{id}/seen`, sent on mount, on visibility, and
with the run id the moment a watched run ends — the browser sees the terminal
event a beat before `finishRun` settles the row, so `finishRun` keeps an
existing `seen_at`). An attached stream does not count: iOS keeps it open
behind the lock screen. Cancelled runs are seen by definition.

`activity.ts` reads all of that into Home, the sidebar's dots and the badge
(approvals + unseen + unread General reports; a busy chat doesn't count). The
badge travels in every push (`payload.badge`, counted at send time, after the
run's state is written) so `sw.js` can set it while the app is closed. Run
transitions go to the browser as `run.changed` on an **ephemeral** channel
(`publishActivity`): never persisted, never on `/api/v1/changes` — Android
answers every durable event with a full refresh, and the browser re-reads
`/api/activity` on reconnect anyway. `AppShell` must not `router.refresh()` on
them. On boot, `recoverActiveRuns()` (instrumentation) re-attaches runs the
last process held — once the gateway answers `/health` (up to 90s), since on a
host reboot it starts beside this app and attaching at once would fail every
run with a push each; ones older than six hours are closed quietly, because
before this every restart stranded one.

An approval push links `?approval=<run id>`. The thread focuses the card and
drops the parameter with `history.replaceState` (a `router.replace` re-renders
the server page and refetches the transcript), or says the approval was
already answered when activity shows that run isn't waiting.

**A dropped upstream stream cannot be resumed, only polled.** `attach()` tries
one re-attach and then falls back to polling `GET /v1/runs/{id}` until the run
settles, synthesising the terminal event into our log. It does not pretend to
resume the token stream: the upstream queue is destroyed on disconnect, so a
"successful" reattach would silently skip everything emitted in the gap.

**An imported session is never deleted or renamed in Hermes.** "Bring in a
chat" (`adoptSession`) attaches an existing session from the CLI or Telegram
to a project under its own id — the project's profile only, never General,
never one already attached. It is flagged `project_sessions.imported`: removing
it here, or purging its project, drops the local row and leaves the transcript
where it came from, and a rename stays local, the same way a Bot Chat's does.
Forks made from it are ordinary sessions.

**"What changed" runs git as this app's user, read-only and hardened.**
`git-changes.ts` uses `execFile` (never a shell) in a realpath-checked cwd,
disables fsmonitor, hooks, external diff and textconv per call, sets
`GIT_OPTIONAL_LOCKS=0` so it never holds the index lock the agent's own
`git commit` needs, and caps time, output and patch size. A repo it can't read
answers 200 with a reason, not an error. Filter drivers can't be turned off
from the command line; that is not a new exposure, since the agent already
runs commands as the same user.

**Compaction keeps the session id.** Hermes compacts in place by default, so a
project's session id is durable for its whole life. That is what makes
one-chat-per-project hold. `/api/sessions/{id}/messages` resolves compaction
chains server-side.

## Hermes API constraints (verified in `gateway/platforms/api_server.py`)

Worth knowing before designing a feature around this API — the published docs
leave most of it unspecified. **Read the running instance's `api_server.py`, not
the docs and not this list.** The notes below were checked against **0.20.5**;
the app was originally built against 0.17.0 and three of these bullets used to
say the opposite.

- **Auth** is `Authorization: Bearer $API_SERVER_KEY`. Required even on
  loopback; the gateway refuses to start the API server without it.
- **`GET /v1/capabilities` is the version handshake.** It returns a `features`
  map (`run_steer`, `model_options`, `session_fork`, `skills_api`, …) and an
  `endpoints` map. `useStatus()` reads it and everything version-dependent —
  the model picker, Steer, Branch, Toolsets — hides rather than 404s when the
  connected Hermes doesn't advertise it. Add a capability check, not a version
  check, when this API grows again.
- **`POST /v1/runs` accepts `session_id`**, which is what gives durable
  per-project threads *plus* stop, steer and approvals. Prefer it over
  `/api/sessions/{id}/chat/stream`.
- **Run event vocabulary on `/v1/runs/{id}/events` (0.20.5).** There is no
  discriminated union for this anywhere in Hermes — the list is
  `_make_run_event_callback` plus the literals in `_handle_runs`:

  | event | payload |
  |---|---|
  | `message.delta` | `delta` |
  | `tool.started` | `tool`, `preview` |
  | `tool.completed` | `tool`, `duration`, `error` |
  | `reasoning.available` | `text` |
  | `subagent.start` / `subagent.complete` | `goal`, `status`, `summary`, `duration_seconds`, `input_tokens`, `output_tokens`, `cost_usd`, `files_read`, `files_written`, `task_index`, `task_count`, `model`, `depth` |
  | `approval.request` | `command`, `description`, `pattern_key`, `allow_permanent`, `allow_session`, `smart_denied`, `choices` |
  | `approval.responded` | `choice`, `resolved` |
  | `run.steered` | `accepted` |
  | `run.stopping` | — |
  | `run.completed` / `run.failed` / `run.cancelled` | terminal |

  **`run.started` and `hermes.tool.progress` are not on this stream** — both
  exist only on `/api/sessions/{id}/chat/stream`. `_thinking` is deliberately
  withheld as "high-volume UI noise". Anything `useThread` handles beyond the
  table above is compatibility with older builds.

- **`reasoning.available` is a boundary, not new text.**
  `agent/conversation_loop.py` fires it after *every* assistant message in the
  agent loop carrying that message's own `content[:500]` — which
  `message.delta` has already streamed. On the last iteration it duplicates the
  final answer. So the thread cuts the stream at each one and holds the
  segment: a following `tool.started` proves the segment was interstitial
  narration and moves it into `ThinkingTrace`; a terminal event proves it was
  the answer and leaves it alone. Cutting by index, not by matching the event's
  text — that text is truncated to 500 chars and can't locate anything.
- **`/v1/runs/{id}/steer` exists** (0.20.5; it genuinely did not in 0.17).
  Body `{input|message|text}`. It 409s `run_not_accepting_steer` unless the
  run's status is exactly `running`, which excludes `waiting_for_approval` and
  the window after `/stop`. `run-manager.sendMessage` tries it first and falls
  back to the message queue on any failure — attachments always queue, because
  steer is text-only.
- **Approval body** is `{"choice": "once"|"session"|"always"|"deny", "all"?: bool}`.
  `choices` on the event is authoritative; `always` persists `pattern_key`,
  which is usually broader than the one command shown, so the card displays it.
- **Model selection is per run, not per session.** `GET /api/model/options` is
  the real inventory (providers, models, per-model `{fast, reasoning}`) —
  `/v1/models` only lists the virtual `hermes-agent` alias plus configured
  `model_routes`. Pass `model` / `provider` / `model_options`
  (`{reasoning:{enabled,effort}, fast}`) on `POST /v1/runs`. Do **not** also use
  the session lock `POST /api/sessions/{id}/model`: a lock combined with a
  per-run model is what `_request_route_conflict_error` rejects. The inventory
  call fetches pricing and is slow, so `/api/models` memoises it for 10 min.
- **Cron jobs cannot be delivered to this app, only read off disk.**
  `/api/jobs` is full CRUD (`GET|POST /api/jobs`, `GET|PATCH|DELETE
  /api/jobs/{id}`, `POST .../pause|resume|run`) and works, but nothing about it
  can point at a PWA. `deliver` resolves against `_KNOWN_DELIVERY_PLATFORMS` in
  `cron/scheduler.py` — telegram, discord, slack, signal, … — plus plugin
  platforms declaring `cron_deliver_env_var`. `webhook` is in that set and is
  *not* a way in: its adapter only answers requests it received, so a
  cron-supplied target finds no delivery info and the response becomes a log
  line. Jobs created over HTTP also get `origin = {platform: "api_server",
  chat_id: "api"}` hardcoded, which is not a delivery platform, so
  `deliver: "origin"` falls through to some other platform's home channel and
  `attach_to_session` — the flag that mirrors output into the origin session —
  can never fire. `/api/jobs` doesn't accept that field anyway.

  What works instead: `run_job` calls `save_job_output` **before** it attempts
  delivery, so `~/.hermes/cron/output/<job_id>/<YYYY-MM-DD_HH-MM-SS>.md` exists
  whatever `deliver` says. This app runs on the same host, so `cron-watcher.ts`
  polls `/api/jobs`, notices a new output file, and reads it.

  **A job reports to exactly one place.** Mechanically it could do both, and
  briefly did: binding a project left `deliver` alone, so one fire arrived as a
  Telegram message and a push notification seconds apart, and a per-job
  always/on-failure/never switch existed to mute one of them. The switch was
  the tell — the redundancy was never worth the control it needed. Binding a
  job now forces `deliver: "local"`, and the route decides that rather than
  the form, so the rule holds for any caller.

  **Every bound job reports into one General chat**, as a plain message — no
  model turn. This copies how Hermes itself delivers. Checked against upstream
  `main` (`cron/scheduler_delivery.py`), not a running 0.20.5: output lands in
  one ongoing conversation (a Telegram home channel, or a profile's Bot Chat
  via `deliver: bot-chat`), and with `attach_to_session` / `cron.mirror_delivery`
  it is also written into that chat's transcript so a reply has context.
  Neither lane reaches this app: api_server origins count as origin-less, and
  `bot-chat` needs a live Desktop/TUI owner. So the watcher keeps reading the
  output file, and only the last step copies Hermes. General is an ordinary
  project with exactly one session, named by the `general_project_id`
  app_settings row. It is created lazily, adopting an existing project called
  "General" first. New chat, `/new` and branch answer 409
  `general_single_chat`, and purging it while jobs are bound answers 409,
  because bindings cascade with their project. Archiving it is allowed, but the
  next delivery unarchives it, chat included: a report nobody can see has not
  been delivered.

  The mirror is `buildConversationHistory()`. No endpoint appends to a
  transcript, but caller-supplied `conversation_history` is authoritative for
  the turn (`api_server_runs.py`), so the newest 20 reports are woven in by
  timestamp on every run in that chat. The cap exists because they live
  outside Hermes' transcript and compaction can never shrink them.

  This replaced a protected, read-only Scheduled inbox per project, where
  replying spawned a new root chat per report (`cron_discussions`). That was
  two conversation models and a sidebar full of one-message threads.
  `migrateScheduledToGeneral()` re-homes every report into General, then hides
  the inboxes and reply threads (archived, stamped `retired_at`) and runs once
  (app_settings `scheduled_general_migrated`). **It never deletes anything in
  Hermes.** Those threads are the user's transcripts, and an upgrade has no
  business destroying them. Settings → Old scheduled threads offers the
  delete as an explicit, confirmed step (`DELETE /api/scheduled/retired`) for
  whoever doesn't want them. v1 keeps the shape: `scheduledSessionId` /
  `unreadScheduledCount` now describe General, `kind` is always `chat`, and
  `scheduled/reply` answers 410.

  Three details that bite:

  - **A fire is identified by the file it wrote, not by a timestamp.** Hermes
    reports two that describe the same fire and differ by milliseconds —
    `latest_execution.finished_at` and `last_run_at` — and the first is not on
    every response. Keying on either meant a fire stamped from one field and
    compared against the other looked new forever, which delivered a
    three-day-old report twice on the first binding. `cron_deliveries` has a
    unique index on `(job_id, source_path)` so it cannot recur.
  - **`include_disabled=true` is mandatory.** Pause sets `enabled: false` and
    the default list drops those, so a paused job reads as deleted.
  - **`jobs_admin: false` in `/v1/capabilities` is a hardcoded literal** while
    the whole surface is live, and the `endpoints` map omits `/api/jobs`. This
    is the one place the "check a capability, not a version" rule does not
    apply — a real `GET /api/jobs` is the probe, and 501 means no cron module.
  - **A bad schedule comes back as 500, not 400.** `parse_schedule` raises
    `ValueError` and the handler wraps everything in one `except`;
    `src/lib/job-errors.ts` rewrites those to 400 so the form can show them.
    Five messages, and `Invalid duration` is the easy one to miss — it escapes
    from `parse_duration` before the catch-all `Invalid schedule` is reached.
  - **Never PATCH `repeat`.** The whitelist admits it, but a job stores it as
    `{times, completed}` and `update_job` merges with `{**job, **updates}` —
    so a number would replace the dict and every later `repeat.get("times")`
    in the scheduler would raise. Run limits are create-only over this API.

  The output file is a whole report — header, `## Prompt` with any skill's text
  inlined, then `## Response` (or `## Error` for a run titled `(FAILED)`).
  Split on the **last** heading: skills are pasted in verbatim and one may well
  contain a `## Response` of its own.

- **Slash commands are not routed.** Still true, and it is the single biggest
  gap between this app and the CLI. `api_server.py` never imports
  `gateway/slash_commands.py`, so `/compress` reaches the model as literal
  text — and no endpoint serves the catalogue either, since it lives in the CLI
  process (`hermes_cli/commands.py`). So `src/lib/commands.ts` carries the
  catalogue itself — and the cut it carries is **Telegram's**, not the CLI's.
  Hermes builds both menus from one `COMMAND_REGISTRY`; `telegram_bot_commands()`
  takes every entry whose `cli_only` flag is unset, which on 0.20.5 is 63. A
  phone is a messaging surface, so that is the right list: `/skin`, `/palette`,
  `/copy`, `/tools` and `/quit` are CLI-only and Telegram doesn't offer them
  either. One of the 63, `/hermes_live`, is plugin-registered and therefore
  per-install, so it isn't hardcoded.
  That leaves **19 dispatch** to endpoints this app owns and actually run, and
  **46 catalogued** — of which **4 `unbuilt`** have an endpoint but no UI yet
  and 42 are `no-api`, listed greyed with what stands in for them here.
  `/approve` and `/deny` answer the pending card, `/save` exports, `/sessions`
  and `/resume` bring a session in, and `/diff` reads the working tree here
  rather than asking the agent; `needs` hides the first two without a pending
  approval and `/diff` without a cwd. Typing
  a real-but-unavailable command explains itself instead of spending a turn.
  Regenerate from the running instance rather than the docs, and check the
  route table before promoting anything. `/cron` stays absent even though
  `/api/jobs` is now wired: it is `cli_only` upstream, so Telegram doesn't
  offer it either, and Settings → Scheduled is where it lives here.
- **No per-request working directory.** `_create_agent` takes no cwd parameter,
  so `.hermes.md` / `AGENTS.md` discovery always resolves against the gateway's
  own cwd, never per project. A project's directory is stated in the
  instructions as text.
- **Attachments are text + images only** (`http(s)` or `data:image/...`).
  Uploaded files and documents are rejected with `400 unsupported_content_type`.
  So `/api/upload` splits them: images become `data:` URLs inlined as
  `image_url` content parts, everything else is written to the host's disk (the
  project's `cwd`, else `~/.hermes/cache/pwa-uploads/<project>/`) and only its
  absolute path goes in the prompt text, for the agent to open with its own
  file tools. `/api/files` serves them back, allowlisted to those two roots.
  0.20.5 does add `POST /v1/artifacts/upload` and
  `GET /v1/artifacts/download/{id}`, but they are gated on
  `browser.extension_control.enabled`, which is `false` on this instance and
  scoped to browser control — not a general file transport. The disk split
  stays.

  Two entry points reach that split, and both go through `Composer.attach()`:
  the paperclip's file input, and pasting an image into the textarea. The paste
  handler reads `clipboardData.items` and returns *before* `preventDefault()`
  when there is no image on the clipboard, so a text paste is still a text
  paste.
- **`/api/ws` and `/api/pty` are dashboard-only** (port 9119). Over `:8642`,
  SSE is the only push transport.

- **Bot Mode Bots are profiles, served at `/p/<profile>/`.** Checked against
  upstream `main` (Oct 2026), not a running instance. Bot Mode is Desktop UI over
  Hermes profiles; what reaches `:8642` is the multiplexer
  (`gateway.multiplex_profiles`, now always on), which mirrors every route
  under `/p/<profile>/` with that profile's config, memory, skills and session
  DB (`api_server_profile_prefix.py`). What bites:

  - **The key is per profile.** A prefixed request must carry the API_SERVER_KEY
    from `~/.hermes/profiles/<id>/.env`. The default key is rejected, and a
    profile without its own key fails closed with 401. Bot Mode does not write
    one. `hermes.ts` reads it from that file (same host), or from
    `HERMES_PROFILE_<ID>_KEY`.
  - **Nothing lists profiles over HTTP.** The roster is
    `HERMES_HOME/profiles/*` plus `profile.yaml` (`ui_meta['hermes-bots'].title`
    is the Bot's name). Every entry is probed: `GET /p/<id>/health` is
    unauthenticated and 404s for a prefix the gateway does not serve (parked,
    standalone, old Hermes); `/p/<id>/v1/capabilities` then tests the key.
    No capability flag covers this, so the real request is the probe.
  - **The Bot Chat is the session titled exactly `Bot Chat`.**
    `tools/bot_mode_probe.py` gates the roster prompt section and
    `message_agent` on that title, and only when some profile is managed (has
    `ui_meta['hermes-bots']`). Find it with
    `GET /api/sessions?title=Bot%20Chat&include_hidden=1`, which is what
    `hermes peer dm` does; `include_hidden` is honoured only with a title.
    Never suffix that title the way `createProjectSession` does for
    collisions, because "Bot Chat (2)" is an ordinary session.
  - Explicit session ids pass through a prefix unchanged. Only ids that
    Hermes derives itself are namespaced by profile.
  - **A Bot Chat may have another writer.** If the Desktop holds that Bot Chat
    live, or the gateway runs under session authority, `POST /v1/runs` into it
    is admitted to the owner's mailbox (`_admit_to_live_bot_chat`,
    `api_server_runs.py`). That run streams no deltas or tool events, only a
    terminal `run.completed` carrying `output`. `/stop` cancels our run while
    the owner's turn carries on. The thread still refreshes on the terminal
    event, and `runText()` falls back to `output` for the notification. Turns
    the Desktop or CLI run in the same chat show up only on reload.

  So a project carries `projects.profile`, which is fixed at creation because
  its sessions live in that profile's DB, and every Hermes call for it goes
  through `hermesForProject()` / `runManager.clientFor()`. A run id is resolved
  through its run row to the same profile. The Bot Chat row is flagged
  `project_sessions.bot_chat` rather than given a new `kind`, because native
  clients switch on `kind`. It is renamed locally only, never deleted from
  here (Desktop, CLI and other Bots all write to it), and one project per Bot
  Chat. Out of scope: cron jobs of a non-default profile (the watcher reads
  the default profile's `/api/jobs` only), `bot_peers` on other machines, and
  rooms/group chat (Desktop JSON-RPC over `/api/ws`, not `:8642`).

Hermes versions differ. When something behaves unexpectedly, read the running
instance's `gateway/platforms/api_server.py` rather than the docs.

## Environment

```
HERMES_API_URL=http://127.0.0.1:8642
HERMES_API_KEY=<same value as Hermes' API_SERVER_KEY>
DB_PATH=~/.hermes-pwa/state.db
HERMES_CRON_DIR=~/.hermes/cron            # where the gateway writes job output
HERMES_HOME=~/.hermes                      # Bot Mode profiles: <home>/profiles/<id>/{profile.yaml,.env}
HERMES_PROFILE_<ID>_KEY=                   # optional; overrides a profile's .env API_SERVER_KEY
VAPID_PUBLIC_KEY= / VAPID_PRIVATE_KEY=     # npx web-push generate-vapid-keys
VAPID_SUBJECT=                             # must be a routable mailto:/https: — Apple checks
```

## Deploying

Full setup notes are in `deploy/README.md`. Short version:

```bash
./deploy/deploy.sh <user>@<host>
```

Things that bite:

- **Build on the target, never ship `.next`.** `better-sqlite3` is native; a
  macOS build will not run on Linux.
- **`ExecStart` must invoke `node_modules/next/dist/bin/next`**, not
  `node_modules/.bin/next` — the latter is a pnpm shell wrapper and node dies
  with `SyntaxError: missing ) after argument list`.
- **Where sudo needs a password**, run it as a `systemctl --user` unit with
  `loginctl enable-linger` rather than a system unit.
- **`tailscale serve` is required, not cosmetic.** Service workers and Web Push
  need a secure context, and `http://100.x.x.x` is not one. Tailscale issues a
  real cert for the MagicDNS name, which is what makes the PWA installable on
  iOS (16.4+, and only once added to the home screen).
- Deploys must never overwrite `.env.production` or the SQLite state DB.

```bash
ssh <user>@<host> 'journalctl --user -u hermes-pwa -n 50 --no-pager'
```

## Verifying against a real Hermes

The disconnect test is the one that matters: start a long task, lock the phone
for two minutes, unlock, and confirm the full transcript is there mid-stream
with no lost tokens. Also worth checking after streaming changes: stop settles
as `cancelled` with partial output retained; two messages sent during an active
run queue and the second auto-starts on completion.

Scheduled jobs need the gateway to actually fire one. Point an existing job at
this app in Settings, press Run now, and confirm within ~30s that the result
appears in the General chat, and that a reload still shows it. That is the
merge in `/api/projects/[id]/messages`, and the check that catches a delivery
living only in client state. Then reply to the report there and confirm the
agent knows what you are talking about.

Push has its own gate, and it is not testable in a browser tab: iOS 16.4+ only
grants notification permission to a PWA already added to the home screen, over
a secure context. Install it, enable notifications in Settings, then start a
long task and **close the app fully** — the notification should arrive and tap
through to the right project.

## UI provenance

Components are adapted from [beautifului.dev](https://www.beautifului.dev/)
(MIT, Tailwind v4 + React 19, no Radix or framer-motion). There is no CLI or
registry — components are copy-paste, and the originals are self-animating
demos (`demo`/`loop` props, scripted `setTimeout` phase machines) that were
converted to be data-driven. Its colour tokens (`--ink`, `--surface`, `--field`,
`--line`, `--accent`, …) are in `globals.css` and everything depends on them.
The library's `SidebarNav` and the local `GlideMenu` reimplementation it
depended on are both gone: navigation is `ProjectSidebar`, a permanent
column from `lg` up and a drawer behind the header's menu button below it.
The header's run dot (`RunDot`, fed by `RunStatusContext`) is the only
at-a-glance signal of a live run once the thread has scrolled past it.

**Keyframes must be declared at the top level of `globals.css`, never inside
`@theme`.** Tailwind v4 treats keyframes in `@theme` as theme keyframes and
emits only the ones an `animate-*` utility pulls in. Everything here animates
through inline `style={{ animation: "fade-up …" }}`, which the scanner cannot
see — declared in `@theme` they are all tree-shaken out and every animation in
the app silently does nothing.

Motion tokens (`--duration-*`, `--ease-*`) come from
[transitions.dev](https://transitions.dev/), an agent skill rather than a
runtime dependency (`npx skills add Jakubantalik/transitions.dev`).

WebKit buffers streaming responses until 1024 bytes arrive, so early tokens can
paint in a burst rather than smoothly. That is Safari, not a bug in the stream.
