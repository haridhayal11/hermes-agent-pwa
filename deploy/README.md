# Deploying Hermes PWA to the Hermes node

The target is whichever machine already runs your Hermes gateway, reached
over your tailnet and served at `https://<node>.<tailnet>.ts.net`. The app and
the Hermes API server run on the same box, so Hermes stays bound to loopback
and `HERMES_API_KEY` never leaves the machine.

## One-time setup on the target

### 1. SSH access

Deploys are non-interactive, so key auth is required:

```bash
# from the Mac
ssh-copy-id <user>@<host>
ssh -o BatchMode=yes <user>@<host> whoami   # must print the user, not prompt
```

### 2. Runtime

The app and Firebase Admin require **Node 22+**, and the build needs pnpm:

```bash
node -v          # must be >= 22
npm i -g pnpm
```

### 3. Hermes API server

In `~/.hermes/.env` on the target:

```
API_SERVER_ENABLED=true
API_SERVER_KEY=<a long random string>
# leave the bind on loopback — the PWA reaches it over 127.0.0.1
API_SERVER_HOST=127.0.0.1
```

`API_SERVER_KEY` is mandatory even on loopback; the gateway refuses to start
the API server without it. Restart the gateway, then check:

```bash
curl -fsS localhost:8642/health                                   # {"status":"ok"}
curl -fsS localhost:8642/v1/skills -H "Authorization: Bearer $API_SERVER_KEY" | head
```

The second call is worth doing — it's what backs the project skill picker, and
it confirms the key is right.

### 4. App environment

`/opt/hermes-pwa/.env.production` (not synced by deploys, not in git):

```
PORT=3000
HERMES_API_URL=http://127.0.0.1:8642
HERMES_API_KEY=<same value as API_SERVER_KEY>
DB_PATH=/var/lib/hermes-pwa/state.db
VAPID_PUBLIC_KEY=<from: npx web-push generate-vapid-keys>
VAPID_PRIVATE_KEY=<same command>
VAPID_SUBJECT=<optional; a routable mailto: or https: URL>
HERMES_CRON_DIR=/home/<gateway user>/.hermes/cron
FIREBASE_PROJECT_ID=<optional Firebase project for Android push>
GOOGLE_APPLICATION_CREDENTIALS=</outside/repo/service-account.json>
```

`VAPID_SUBJECT` is optional but not cosmetic. It is the JWT `sub` claim, and
Apple rejects anything unroutable with `403 BadJwtToken` — which on iOS means
notifications fail silently. The default is the project repo URL, which works;
set this only if you want a different contact on the claim.

Native Android push is independent of VAPID. If enabled, Firebase Admin uses
Application Default Credentials and `FIREBASE_PROJECT_ID`; the service-account
file stays outside Git. The APK must be built with the matching ignored
`android/app/google-services.json`. Either push provider may be configured on
its own.

`HERMES_CRON_DIR` is how scheduled jobs reach a project. Hermes cannot deliver
a cron result to a PWA — `deliver` only resolves to registered gateway
platforms — but it writes every job's output under `<cron dir>/output/<job
id>/` before it tries to deliver, and this app runs on the same host, so that
file is the delivery path. It defaults to `~/.hermes/cron`; set it explicitly
when the service runs as a different user from the gateway, and make sure that
user can read the directory (Hermes creates it 0700).

```bash
sudo mkdir -p /var/lib/hermes-pwa /opt/hermes-pwa
sudo chown -R "$USER" /var/lib/hermes-pwa /opt/hermes-pwa
```

### 5. systemd

If you have root, install it system-wide. Where sudo needs a password, use a
**user** unit instead — no root required:

```bash
mkdir -p ~/.config/systemd/user
cp ~/hermes-pwa/deploy/hermes-pwa.service ~/.config/systemd/user/
# set ExecStart/WorkingDirectory to absolute paths, drop the User= line
systemctl --user daemon-reload
systemctl --user enable --now hermes-pwa
loginctl enable-linger "$USER"   # required, or it stops when you log out
```

`ExecStart` must invoke `node_modules/next/dist/bin/next`, **not**
`node_modules/.bin/next` — the latter is a shell wrapper and node exits with
`SyntaxError: missing ) after argument list`.

### 6. HTTPS over the tailnet

**Required, not cosmetic.** Service workers and Web Push need a secure
context, and `http://100.x.x.x` is not one — so without this the app is not
installable and notifications cannot work at all.

```bash
sudo tailscale serve --bg 3000
tailscale serve status     # prints the https://<node>.<tailnet>.ts.net URL
```

Tailscale provisions a real certificate for the MagicDNS name, which is what
makes the PWA installable on iOS.

## Deploying

```bash
./deploy/deploy.sh <user>@<host>
```

The script builds **on the target** rather than shipping `.next`, because
`better-sqlite3` is a native module and a macOS build will not run on Linux.
It never overwrites `.env.production` or the SQLite state DB.

## Verifying

```bash
ssh <user>@<host> 'journalctl --user -u hermes-pwa -n 50 --no-pager'
curl -fsS https://<node>.<tailnet>.ts.net/api/status
```

Then from the iPhone, on the tailnet: open the MagicDNS URL, Share → Add to
Home Screen, and confirm it opens standalone. Push notifications only work
once it is installed to the home screen (iOS 16.4+).
