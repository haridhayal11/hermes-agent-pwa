# Setting this up — instructions for an agent

**You are reading this because someone asked you to install Hermes PWA for
them.** Follow it top to bottom. It is written so that you never have to guess:
every check states its pass condition, and every failure states its fix.

The machine you are working on is **the one that already runs the user's Hermes
gateway**. The app talks to Hermes over loopback and is reached from the user's
phone over their tailnet. If you are on a laptop and the gateway is elsewhere,
stop and read [`deploy/README.md`](deploy/README.md) instead — that is the
remote-deploy path, and it is a different runbook.

Expect this to take about ten minutes, most of it `pnpm install`.

## Rules

Read these before running anything.

- **Never point the browser at `:8642`.** Hermes' event stream is
  single-consumer and dies on disconnect; the whole reason this app exists is
  to be that consumer on the phone's behalf. All browser traffic goes to this
  app's own routes.
- **Never overwrite an existing `.env.production` or `state.db`.** If the app
  is already installed, you are upgrading, not installing — back both up and
  say so before touching anything.
- **Never copy a prebuilt `.next` between machines.** `better-sqlite3` is a
  native module; a macOS build will not run on Linux. Always build on the host
  that will run it.
- **Never echo the user's `API_SERVER_KEY`, VAPID private key or `.env` file
  back to them**, into a transcript, or into a commit. Read them, write them,
  do not display them.
- **Ask before writing outside the install directory.** The systemd unit and
  `tailscale serve` both change machine state; name what you are about to do
  first.
- **Do not invent values.** If a preflight check fails, report it and ask.
  Guessing at a port or a key produces an app that starts and then fails
  silently on every send.

## Step 1 — Preflight

Run all of these before asking the user anything. Report the whole set at once
rather than stopping at the first failure.

```bash
node -v                     # must be >= 20.9 — Next 16 requires it
pnpm -v                     # any recent version; `npm i -g pnpm` if missing
uname -s                    # Linux → systemd path. Darwin → launchd, see Step 5
tailscale status            # must print a tailnet; the app needs HTTPS
curl -fsS -m 5 http://127.0.0.1:8642/health
```

`/health` should answer `{"status":"ok"}` or similar. If it does not, the API
server is off. It is enabled in the gateway's own `~/.hermes/.env`:

```
API_SERVER_ENABLED=true
API_SERVER_KEY=<a long random string>
API_SERVER_HOST=127.0.0.1
```

`API_SERVER_KEY` is mandatory even on loopback — the gateway refuses to start
the API server without it. If you have to add it, the user must restart the
gateway before you continue.

Then confirm the key works, and record what the instance supports:

```bash
curl -fsS localhost:8642/v1/capabilities -H "Authorization: Bearer $API_SERVER_KEY"
```

A `401` means the key is wrong — that is the single most common cause of an
install that looks fine and then fails on the first message. A `200` returns a
`features` map (`run_steer`, `model_options`, `session_fork`, `skills_api`, …).
Note it: the app checks capabilities rather than version numbers, and hides the
model picker, Steer, Branch and Toolsets rather than 404ing when the connected
Hermes doesn't advertise them. If a feature the user asks about is missing
here, it is missing because their gateway is older, not because the app is
broken.

Optional, and worth doing — it is what backs the project skill picker:

```bash
curl -fsS localhost:8642/v1/skills -H "Authorization: Bearer $API_SERVER_KEY" | head
```

## Step 2 — Ask the user, once

Collect all of this in **one** round of questions. Do not drip-feed; you have
everything you need to ask now, and the install is uninterrupted afterwards.

| Ask | Default if they don't care |
|---|---|
| Install directory | `~/hermes-pwa` |
| Port | `3000` |
| Where the SQLite state DB lives | `~/.hermes-pwa/state.db` |
| Enable push notifications? | Yes — you generate the keys |
| A contact URL for `VAPID_SUBJECT` | the project repo (see below) |
| Does the gateway run as a **different** OS user? | No |
| What should the agent be called? | Hermes |

Notes on the ones with teeth:

- **Push is optional but not repairable later without a restart.** Declining is
  fine; Settings then reads "the server has no VAPID keys". Say so.
- **`VAPID_SUBJECT` must be a real, routable `mailto:` or `https:` URL.** It is
  the JWT `sub` claim. Apple validates it where Chrome and Mozilla wave it
  through, and answers `403 {"reason":"BadJwtToken"}` for anything unroutable —
  which, on the one platform this app is actually installed on, means every
  notification is silently dropped. `mailto:someone@localhost` is the trap.
  Leaving it blank is safe: it defaults to the project repo URL, which works.
- **A different gateway user** matters because of scheduled jobs. Hermes writes
  every job's output under `<cron dir>/output/<job id>/` and this app reads it
  off disk. Ask for the path (`HERMES_CRON_DIR`, default `~/.hermes/cron`) and
  check the service user can read it — Hermes creates that directory `0700`.
- **The agent's name** is not needed at install time; it is set in the app under
  Settings → Agent, is stored server-side and is shared by every device. Ask
  now so you can set it for them at the end.

## Step 3 — Install

```bash
git clone https://github.com/haridhayal11/hermes-agent-pwa.git <install-dir>
cd <install-dir>
pnpm install --frozen-lockfile
```

Write `.env.production` from `.env.example` — **refuse to overwrite an existing
one**; check first and back it up if it is there.

```bash
test -e .env.production && { echo "already exists — back it up and stop"; exit 1; }
cp .env.example .env.production
```

Then fill it in. Minimum viable is `HERMES_API_KEY`; everything else has a
working default.

```
PORT=3000
HERMES_API_URL=http://127.0.0.1:8642
HERMES_API_KEY=<same value as the gateway's API_SERVER_KEY>
DB_PATH=/home/<user>/.hermes-pwa/state.db
HERMES_CRON_DIR=/home/<gateway user>/.hermes/cron
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

If the user wanted push, generate the pair and paste both in:

```bash
npx web-push generate-vapid-keys
```

Then build. Build failures here are real — do not proceed past one.

```bash
pnpm build
```

## Step 4 — Run it as a service (Linux)

Prefer a **user** unit. It needs no root, which is the common case on a laptop
or a home server where `sudo` prompts for a password.

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/hermes-pwa.service <<'UNIT'
[Unit]
Description=Hermes PWA — Hermes command center
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=<absolute install dir>
EnvironmentFile=<absolute install dir>/.env.production
ExecStart=/usr/bin/env node node_modules/next/dist/bin/next start -p ${PORT}
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hermes-pwa

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now hermes-pwa
loginctl enable-linger "$USER"     # or it stops the moment they log out
```

Substitute the real absolute paths — systemd does not expand `~`, and a
relative `WorkingDirectory` is rejected.

**`ExecStart` must invoke `node_modules/next/dist/bin/next`, not
`node_modules/.bin/next`.** The latter is a pnpm shell wrapper, and node dies
on it with `SyntaxError: missing ) after argument list`.

If the user has passwordless root and would rather have a system unit,
[`deploy/hermes-pwa.service`](deploy/hermes-pwa.service) is the template —
it installs to `/etc/systemd/system/`, wants `WorkingDirectory` and
`EnvironmentFile` pointed at `/opt/hermes-pwa`, and needs `User=` set to a real
username (the checked-in `%i` is a template specifier and will not resolve in a
plain unit). `loginctl enable-linger` is then unnecessary.

**On macOS**, there is no systemd. Write a launchd plist to
`~/Library/LaunchAgents/dev.hermes-pwa.plist` with the same `ExecStart`
equivalent (`ProgramArguments`), `RunAtLoad`, `KeepAlive`, and the environment
loaded from `.env.production`, then `launchctl load` it.

Confirm it came up before moving on:

```bash
systemctl --user is-active hermes-pwa          # active
journalctl --user -u hermes-pwa -n 30 --no-pager
```

The journal should include one line from the cron watcher at boot, which is how
you know that half started too.

## Step 5 — HTTPS over the tailnet

**Required, not cosmetic.** Service workers and Web Push need a secure context.
`http://100.x.x.x` is not one, so without this the app cannot be installed to a
home screen and notifications cannot work at all.

```bash
tailscale serve --bg 3000      # sudo may be needed
tailscale serve status         # prints the https://<node>.<tailnet>.ts.net URL
```

Tailscale provisions a real certificate for the MagicDNS name. Give that URL to
the user — it is the only address they should ever use.

## Step 6 — Verify

Work through all of it. Report what passed and what did not; do not summarise
as "done" on the strength of the service being up.

```bash
curl -fsS http://127.0.0.1:3000/api/status | head -c 400
```

Expect `hermes.reachable: true` and a non-null `hermes.capabilities`. If
`reachable` is false, the key or the URL in `.env.production` is wrong — the
app started fine regardless, which is exactly why this check exists.

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://<node>.<tailnet>.ts.net/
curl -fsS https://<node>.<tailnet>.ts.net/manifest.webmanifest
```

Then one real round trip, which is the only check that exercises the streaming
path: open the URL, create a project, send a message, and confirm tokens stream
in and the run settles.

## Step 7 — Hand off

Three things you cannot do for them.

1. **Install to the home screen.** On the iPhone, on the tailnet, open the
   MagicDNS URL in Safari → Share → Add to Home Screen. It must open without
   Safari chrome afterwards.
2. **Enable notifications — and only then.** iOS 16.4+ grants notification
   permission only to a PWA that is already on the home screen, so this order
   is not negotiable. Settings → Notifications → the master switch, then the
   per-kind switches. Then press Test. It answers `502` with the push service's
   own refusal reason if something is wrong, rather than a cheerful
   `{"sent":0}` — quote that reason back to them verbatim if it appears.
3. **Name the agent.** Settings → Agent → Name, using whatever they told you in
   Step 2. It is shared across all their devices.

Worth telling them, because it is the difference between this and a chat app:

- There is no "new chat" button, on purpose. A project is a long-lived thread.
  Its framing lives in the project's instructions and is re-sent on every run,
  so turn 500 is framed exactly like turn 1.
- Locking the phone mid-run is fine. The transcript is intact on unlock, and a
  notification arrives when the run ends unwatched.
- Search covers project names, instructions and opening prompts only. Message
  bodies live in Hermes, which has no search endpoint.

## When something is wrong

| Symptom | Cause | Fix |
|---|---|---|
| Every send fails, app otherwise fine | `HERMES_API_KEY` ≠ the gateway's `API_SERVER_KEY` | Fix `.env.production`, restart the service |
| `/api/status` says `reachable: false` | Gateway down, or `API_SERVER_ENABLED` unset | Check `curl localhost:8642/health` |
| Notifications work on Chrome, silently do nothing on iOS | `VAPID_SUBJECT` is not a routable URL — Apple returns `403 BadJwtToken` | Set a real `mailto:`/`https:` URL, restart |
| Test notification returns `{"sent":0}` with no error | Nothing is subscribed on this device | Enable notifications in Settings first |
| Notification permission cannot be granted | The app is not on the home screen | Add to Home Screen, then ask again |
| Model picker, Steer or Toolsets missing | The gateway does not advertise the capability | Upgrade Hermes; the app hides rather than 404s, by design |
| Scheduled jobs never reach a project | `HERMES_CRON_DIR` wrong, or unreadable by the service user | Hermes creates it `0700`; fix the path or the permissions |
| `/api/jobs` returns 501 | The gateway has no cron module | Nothing to fix; the Scheduled section stays empty |
| A paused job looks deleted | The list must be fetched with `include_disabled=true` | Already handled; if you see it, file it |
| A `/` command arrives as literal text in the reply | Slash commands are **not** routed by `api_server.py` — it never imports the gateway's slash-command module | Expected. The app carries its own catalogue and marks unroutable commands greyed |
| Service dies at start with `SyntaxError: missing ) after argument list` | `ExecStart` points at `node_modules/.bin/next`, a shell wrapper | Point it at `node_modules/next/dist/bin/next` |
| Works on `http://100.x.x.x`, cannot install or notify | No secure context | `tailscale serve`, and use the MagicDNS URL |
| Early tokens arrive in a burst, then smooth | WebKit buffers a streaming response until 1024 bytes | Safari behaviour, not a bug |

If none of these fit, read [`CLAUDE.md`](CLAUDE.md). It documents the
architecture and a long list of Hermes API constraints checked by reading the
gateway's `gateway/platforms/api_server.py` directly. Hermes versions differ
more than its docs suggest — when the running instance disagrees with anything
written here, the running instance is right.
