# Hermes for Android

The native Kotlin/Jetpack Compose client lives here. It connects to the Next.js
host through the versioned API; Node, SQLite, and the Hermes gateway continue to
run on the host and are never embedded in the APK.

The server contract is [`../docs/api/v1/openapi.json`](../docs/api/v1/openapi.json).
Pairing and cursor behavior are documented in
[`../docs/api/v1/README.md`](../docs/api/v1/README.md).

## Toolchain

- Android Studio with JDK 17 or newer
- Android SDK Platform 37 and Build Tools 36.0.0
- Gradle 9.4.1 (the checked-in wrapper installs it)
- Application ID `com.haridhayal.hermes`; minimum Android 13 / API 33

Install the SDK packages from Android Studio's SDK Manager, then build:

```bash
cd android
./gradlew :app:assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`. Install a
self-built debug APK with `adb install -r app/build/outputs/apk/debug/app-debug.apk`.

## Pairing and transport

On the host, generate a one-time code with `pnpm device pair`, then enter the
host's HTTPS origin, the code, and a device name in the app. Release builds
accept only system-trusted HTTPS. Debug builds additionally allow cleartext
connections to `localhost`, `127.0.0.1`, and the emulator host alias
`10.0.2.2`.

The bearer token is encrypted with an Android Keystore AES-GCM key. Ciphertext,
the Room cache, pending attachment copies, and preferences are excluded from
backup. Unpairing attempts server revocation, deletes the key and ciphertext,
clears Room, and removes protected cache files.

## Architecture

- `app`: single activity, Navigation 3 graph, adaptive drawer/sidebar
- `core:model`: hand-written Kotlin Serialization DTOs
- `core:network`: authenticated JSON, multipart digest/idempotency, and SSE
- `core:database`: Room snapshots, run cursors, media metadata, and outbox
- `core:data`: repositories, Keystore credentials, preferences, WorkManager
- `core:designsystem`: Material 3 theme
- `feature:*`: pairing, projects, chat, search, jobs, and settings UI
- `build-logic`: shared Android and Compose convention plugins

Room is a disposable read cache and keeps at most 500 messages for each visited
session. Pending prompts are different: their UUID idempotency key and private
attachment copies are committed before they appear queued. WorkManager drains
FIFO within a session and can drain separate sessions concurrently. Media cache
policy is a global 512 MB LRU and never includes unsent attachment copies.

Native notifications are optional and use a Firebase project supplied by each
deployment. Put that project's `google-services.json` at `android/app/` before
building; the file is ignored by Git. On the host, set `FIREBASE_PROJECT_ID`
and point `GOOGLE_APPLICATION_CREDENTIALS` at the matching service-account JSON.
Without either side of that configuration the app still builds and runs, and
Settings reports notifications as unavailable.

Receiving content from the Android Sharesheet, speech, and
`VoiceInteractionService` remain outside this release.

## Release signing

Create a keystore outside the repository and provide signing configuration
locally when producing a release APK. Never commit keystores, passwords,
`local.properties`, Firebase configuration, bearer tokens, or build caches.
