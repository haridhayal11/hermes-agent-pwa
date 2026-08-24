#!/usr/bin/env bash
# Deploy the Hermes PWA to the Hermes node.
#
#   ./deploy/deploy.sh <user>@<host>
#   ./deploy/deploy.sh user@100.64.0.1
#
# Builds on the target rather than shipping .next, because better-sqlite3 is a
# native module — a macOS build will not run on Linux.
set -euo pipefail

TARGET="${1:-${HERMES_PWA_DEPLOY_TARGET:-}}"
if [[ -z "$TARGET" ]]; then
  echo "usage: $0 <user>@<host>" >&2
  exit 2
fi

# Relative, so it resolves against the target's home directory — where the
# service actually runs. Pass an absolute path to override.
APP_DIR="${HERMES_PWA_APP_DIR:-hermes-pwa}"
SERVICE="hermes-pwa"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# `ssh host cmd` is non-interactive, so the target's shell rc never runs and an
# nvm-managed node is not on PATH. Every remote block that needs node sources
# nvm itself.
read -r -d '' NVM_PRELUDE <<'PRELUDE' || true
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh" >/dev/null; fi
PRELUDE

say "Checking $TARGET"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$TARGET" bash -seu <<REMOTE
$NVM_PRELUDE
command -v node >/dev/null || { echo "node not installed on target" >&2; exit 1; }
node_major=\$(node -p 'process.versions.node.split(".")[0]')
if (( node_major < 20 )); then
  echo "Next 16 needs Node 20.9+; target has \$(node -v)" >&2
  exit 1
fi
command -v pnpm >/dev/null || { echo "pnpm not installed on target (npm i -g pnpm)" >&2; exit 1; }
echo "node \$(node -v), pnpm \$(pnpm -v)"

# The API server must be up and keyed, or every send will 401.
if ! curl -fsS -m 5 http://127.0.0.1:8642/health >/dev/null 2>&1; then
  echo "WARNING: Hermes API server not answering on 127.0.0.1:8642" >&2
  echo "         set API_SERVER_ENABLED=true and API_SERVER_KEY in ~/.hermes/.env" >&2
fi

# Push is the one feature that fails silently when misconfigured: no keys just
# means the toggle in Settings reads "not configured".
if ! grep -Eq '^VAPID_PRIVATE_KEY=.+' "$APP_DIR/.env.production" 2>/dev/null; then
  echo "WARNING: no VAPID_PRIVATE_KEY in $APP_DIR/.env.production" >&2
  echo "         notifications will be disabled (npx web-push generate-vapid-keys)" >&2
fi
REMOTE

say "Syncing source to $TARGET:$APP_DIR"
ssh "$TARGET" "mkdir -p '$APP_DIR'"
# Source only. node_modules and .next are built on the target; .env.production
# and the SQLite state DB live there and must never be clobbered by a deploy.
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env*' \
  --exclude '*.db' \
  "$REPO_ROOT/" "$TARGET:$APP_DIR/"

say "Installing and building on target"
ssh "$TARGET" bash -seu <<REMOTE
$NVM_PRELUDE
cd "$APP_DIR"
pnpm install --frozen-lockfile
pnpm exec next build
REMOTE

say "Restarting $SERVICE"
# Where sudo needs a password, the service is a --user unit with lingering
# enabled, and there is no root to restart it with.
ssh "$TARGET" bash -seu <<REMOTE
if systemctl --user cat '$SERVICE' >/dev/null 2>&1; then
  systemctl --user restart '$SERVICE'
  sleep 2
  systemctl --user is-active '$SERVICE'
else
  sudo systemctl restart '$SERVICE'
  sleep 2
  systemctl is-active '$SERVICE'
fi
REMOTE

say "Health check"
ssh "$TARGET" "curl -fsS -m 10 http://127.0.0.1:\${PORT:-3000}/api/status >/dev/null && echo 'status ok' || echo 'status endpoint not answering yet'"

say "Done"
