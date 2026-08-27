# Hermes for Android

This directory is reserved for the fully native Kotlin/Jetpack Compose client.
The Android app is a client of the host service in this repository; it does
not embed Node, Next.js, SQLite, or the Hermes gateway.

The server contract is [`../docs/api/v1/openapi.json`](../docs/api/v1/openapi.json).
Authentication and reconnect behavior are explained in
[`../docs/api/v1/README.md`](../docs/api/v1/README.md).

## First-release boundary

1. Pair to a host URL with a one-time code; keep the returned bearer token in
   storage protected by Android Keystore.
2. List, choose, and create projects.
3. Read messages, send with an idempotency key, and consume replayable SSE.
4. Render tool activity, questions, and approval requests; approve, deny, or
   stop the run.
5. Register for native FCM and expose Reply, Approve, Deny, and Stop actions.
6. Receive text, links, images, and documents from the Android Sharesheet.
7. Add press-to-talk with platform speech recognition and text-to-speech.
8. Add `VoiceInteractionService` only after the core assistant loop is solid.

Room is a disposable read cache. The Next/Hermes host remains authoritative
for projects, transcripts, run state, and event replay.

## Before adding the Gradle project

Choose the permanent application id and minimum SDK first; both become durable
release decisions. The initial project should be generated directly in this
directory, use Kotlin and Compose, and keep API/Keystore code outside UI
modules. Do not copy the web UI screen-for-screen—the first navigation should
be pairing, project selection, and the active assistant thread.
