---
version: 1
slug: "src-app-layout-tsx"
primary_target: "src/app/layout.tsx"
related_targets: ["src/app/p/[id]/ChatThread.tsx","src/components/AppShell.tsx","src/app/settings/SettingsView.tsx"]
---

# Surface: Hermes PWA web app (whole app)

Scope: every web route and its overlays: shell header, project sidebar/drawer, chat thread, messages, run status cards (tools, thinking, subagents, approvals, queue), composer and its menus, dialogs, sheets, search, Settings.
Visitor mode: Operate.
Audience and job: self-hosters driving their Hermes agent, phone and Mac about equally. Read long replies, send the next instruction, watch or stop a run, answer an approval, read scheduled reports.
Constraints: dark default; behaviour and copy unchanged; iOS shell invariants in CLAUDE.md; no added weight on the phone.
Memorable moment: a reply streaming into a calm reading column while the composer stays ready to steer.
Unresolved: none.

## Direction contract

THESIS: A familiar chat client at the ChatGPT app's craft: one calm reading column, a darker sidebar of projects, a pill composer. It keeps the category arrangement and refuses the incumbent's unfinished version of it: 12-13px chrome, a web font on a flat grey ramp, a cramped thread.

OWN-WORLD: Hue-free greys. Dark: page #141414, sidebar #0b0b0b, raised #252525 for user bubbles, composer and popovers; ink #ececec / #afafaf / #8f8f8f; hairlines white at 10%. Light mirrors on white, #f9f9f9 sidebar, #f4f4f4 bubbles. System UI face (SF Pro on Apple), system mono for code. Hue only for running, approval and failure. Radii: 28 composer, 24 bubbles, 16 popovers and cards, 10 rows.

STORY: Open the app into the last project, read the reply, type the next instruction; see a live run or a pending approval at a glance and act on it.

FIRST VIEWPORT: Phone 390: 52px header, menu left, project title, pencil and overflow right. Thread: user bubble right; assistant prose full width at 16/28 with quiet action icons beneath. Composer pill at the bottom: attach left, growing field, white send circle, with a stop button beside it while a run is live (send stays usable to steer). Desktop: 260px sidebar, thread max 768px centred.

FORM: canon, the category standard, chosen by the user over the rolled direction; bar: ChatGPT app. seed: ddb4b43f72e4798b
Signature interaction: the streaming reply, with stop appearing beside send and the run dot in the header. Motion grammar: 150-250ms ease-out fades and short rises; sheets and drawer slide; no bounce.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
