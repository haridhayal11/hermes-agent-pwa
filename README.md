# Hermes PWA

An installable, mobile-first command center for a self-hosted
[Hermes Agent](https://hermes-agent.nousresearch.com/docs/). It runs on the
same machine as your gateway, is reachable only over your tailnet, and goes on
your phone's home screen.

It is deliberately **not** a clone of the Hermes dashboard. Projects retain
their working directory, instructions, model, and skills while containing a
tree of durable chats. The active chat selection is shared by the PWA, Android,
and scheduled-job delivery.

```
iPhone / Mac PWA  (installed, https://<node>.<tailnet>.ts.net)
Android client     (native Kotlin/Compose, paired per device)
      ↓ tailnet-only HTTPS; browser API or authenticated /api/v1
Next.js app on the Hermes node  ← UI + route handlers + SQLite
      ↓ localhost, Bearer API_SERVER_KEY
Hermes API server :8642
```

The native Android client is being developed in [`android/`](android/README.md).
Its stable server contract is
[`docs/api/v1/openapi.json`](docs/api/v1/openapi.json): one-time host pairing,
per-device bearer credentials, idempotent sends, and replayable SSE with a
run-scoped cursor. The Android app remains a client; Node, SQLite, and Hermes
continue running on the host.

## Install it with your agent

The setup is a runbook, and [`SETUP.md`](SETUP.md) is written for a coding
agent to execute end to end — preflight checks, the questions it needs to ask
you, the service unit, HTTPS, and the verification pass. On the machine that
runs your Hermes gateway, hand your agent this:

> Clone https://github.com/haridhayal11/hermes-agent-pwa, read `SETUP.md`, and
> install it on this machine. Ask me the questions it tells you to ask before
> you start.

Claude Code, Codex, Hermes itself — anything that can read a file and run a
shell. If you would rather do it by hand, `SETUP.md` reads perfectly well as an
ordinary install guide, and [`deploy/README.md`](deploy/README.md) covers
deploying to a *different* machine from the one you are sitting at.

## What you need

- **A Hermes gateway** on the same host, with `API_SERVER_ENABLED=true` and an
  `API_SERVER_KEY` set. The key is mandatory even on loopback — the gateway
  refuses to start the API server without one.
- **Node 22+** and **pnpm**.
- **Tailscale.** Not optional, and not just for remote access: service workers
  and Web Push require a secure context, and `http://100.x.x.x` is not one.
  `tailscale serve` issues a real certificate for the MagicDNS name, which is
  what makes the app installable on iOS at all.
- **iOS 16.4+** for notifications, and only once the app is on the home screen.

## Why there is a server in the middle

The one thing to understand before changing anything in the streaming path.

Hermes' `GET /v1/runs/{id}/events` is a single-consumer, non-replayable queue
that is **destroyed on disconnect**. A phone cannot be that consumer: iOS
suspends the tab when you lock the screen, and the run's event stream would be
gone permanently.

So `src/lib/run-manager.ts` holds exactly one upstream connection per run, from
localhost, and writes every event to SQLite with a monotonic sequence number.
The browser subscribes to *our* stream instead, which replays from
`?after_seq=N` and then goes live. That is what survives the lock screen,
backgrounding and a change of network — and because the server sees
`run.completed` whether or not anyone is watching, it is also the only reason
push notifications can exist.

## What it does

- **Durable projects and session trees.** New chats are roots, forks are child
  branches, and each session streams and queues independently while sharing
  the project's instructions, working directory, model, and linked skills.
- **Streaming that survives a locked phone**, plus stop, steer, approvals and a
  message queue.
- **Web Push** on completion, on an approval request, on a question, and on a
  scheduled job — with per-device control over which kinds you want.
- **Scheduled jobs.** Hermes cron jobs can be bound to a project and their
  output lands in one protected Scheduled inbox per project. Unread reports
  take priority when opening a project, and replying starts a normal chat with
  the exact report retained as context. Hermes cannot deliver to a PWA, so the
  app reads the output files the gateway writes to disk.
- **Attachments both ways.** Images inline; other files are written to the host
  and named by path, because that is the only shape the API accepts.
- **Search** over project names, instructions and opening prompts. Message
  bodies live in Hermes, which has no search endpoint, and the UI says so
  rather than implying otherwise.

## Development

```bash
pnpm install
cp .env.example .env.local     # fill in HERMES_API_KEY at minimum
pnpm dev
```

To pair a native client with a development or deployed host:

```bash
pnpm device pair              # one-time code, ten-minute lifetime
pnpm device list
pnpm device revoke --id dev_...
```

```bash
pnpm build           # next build
pnpm start           # production server
pnpm lint
pnpm typecheck       # generates Next route types, then runs TypeScript
```

`next lint` was removed in Next 16 and `next build` no longer lints, so eslint
runs separately. `pnpm typecheck` runs `next typegen` first because `PageProps`,
`LayoutProps` and `RouteContext` are generated into `.next/types` rather than
checked into the repository. It therefore works on a clean checkout as well as
after a development or production build.

`pnpm test` runs server contract tests and `pnpm openapi:check` verifies that
every versioned route is represented in the public contract. Android unit,
lint, and APK tasks run from the checked-in Gradle wrapper under `android/`.

[`CLAUDE.md`](CLAUDE.md) is the design document — the architecture, the
invariants, and a long list of Hermes API constraints verified by reading the
gateway's `api_server.py` rather than its docs. Read it before changing
anything structural.

## Credits

UI components are adapted from [beautifului.dev](https://www.beautifului.dev/)
(MIT) — Tailwind v4 and React 19, no Radix and no framer-motion. Motion tokens
come from [transitions.dev](https://transitions.dev/). The app icon is Nous
Research's Hermes mark.

## License

MIT — see [LICENSE](LICENSE).
