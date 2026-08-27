# Native API v1

`openapi.json` is the source of truth for native clients. `/api/v1` is a
deliberate compatibility boundary; the browser's unversioned `/api` routes may
continue evolving with the Next.js UI.

## Trust boundary

- Hermes and `HERMES_API_KEY` remain on loopback. Native clients never call
  port 8642.
- Every v1 route except `POST /api/v1/pairing/claim` requires a per-device
  bearer token.
- Pairing codes are generated on the host with `pnpm device pair`, expire in
  ten minutes by default, and are consumed once.
- SQLite stores SHA-256 digests of pairing codes and access tokens, never the
  credentials themselves.
- The Android client must place the returned token in storage protected by
  Android Keystore and must not log, back up, or sync it.

## Streaming and retries

The host remains the only consumer of Hermes' destructive, non-replayable SSE
queue. It persists the event log and exposes a replayable native stream.

Run events carry an SSE `id` of `<runId>:<sequence>`. On reconnect, send that
value as `Last-Event-ID` (preferred) or `?cursor=`. A sequence is meaningful
only inside its run; the server resets replay to the beginning when the run id
changes. The stream closes after a terminal event. Clients should refresh
messages, then reconnect with capped exponential backoff to discover a queued
run.

Native creates, sends, approvals, and stops require an `Idempotency-Key`.
Generate a new UUID for each user action and retain it until a response is
received. Reusing the same key and body within 24 hours returns the original
successful response; reusing it for a different body is a conflict. PATCH is
already state-setting and does not require a key.

## Pairing from a checkout

The command reads `DB_PATH` from the environment, `.env.production`, or
`.env.local`, falling back to `~/.hermes-pwa/state.db`:

```bash
pnpm device pair
pnpm device list
pnpm device revoke --id dev_...
```

The first command prints only the one-time code. Give the Android client the
host's tailnet HTTPS URL and that code. The client exchanges it at
`POST /api/v1/pairing/claim` and stores the returned token once.
