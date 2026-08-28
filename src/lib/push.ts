import webpush from "web-push";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { db } from "./db";
import { PUSH_KINDS, type PushKind } from "./notification-kinds";

export { PUSH_KINDS };
export type { PushKind };

/* Web Push, server side. This is the only reason the middle tier is worth
 * having: because our run-manager holds the upstream stream whether or not a
 * browser is watching, the backend sees run.completed with the phone locked —
 * and can say so. A browser talking to :8642 directly could never do this. */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";

/**
 * The VAPID `sub` claim: contact-of-last-resort metadata for whoever runs the
 * push service. Nothing here sends or receives on it.
 *
 * It still has to be a *real* mailto: or https: URL. It was an unroutable
 * `mailto:` on localhost for exactly the reason it looks like it was — no
 * mail is ever sent — and Apple answered every notification with
 * `403 {"reason":"BadJwtToken"}`, because it validates the claim where Chrome
 * and Mozilla wave it through. An unroutable address is not a valid one. Since
 * iOS is the only platform this app is really installed on, that meant push
 * silently did nothing at all.
 */
const SUBJECT =
  process.env.VAPID_SUBJECT || "https://github.com/haridhayal11/hermes-agent-pwa";

/** No keys means the feature is simply off; nothing should throw for it. */
export const pushConfigured = Boolean(PUBLIC_KEY && PRIVATE_KEY);

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";
/** Native push is optional and independent of VAPID/Web Push. */
export const nativePushConfigured = Boolean(
  FIREBASE_PROJECT_ID,
);
export const notificationsConfigured = pushConfigured || nativePushConfigured;

if (pushConfigured) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
}

export function publicKey(): string {
  return PUBLIC_KEY;
}

export interface PushPayload {
  title: string;
  body: string;
  /** where notificationclick should land */
  url?: string;
  /** coalescing key — same tag replaces the previous notification */
  tag?: string;
  kind?: PushKind;
}

interface WebSubscriptionRow {
  endpoint: string;
  keys_json: string;
  kinds_json: string | null;
}

interface NativeSubscriptionRow {
  device_id: string;
  installation_id: string;
  kinds_json: string | null;
}

/**
 * Whether this device still wants this kind.
 *
 * NULL is "everything" on purpose: a subscription created before the switches
 * existed must keep receiving what it already received, and a device that has
 * never opened the settings has expressed no opinion. A malformed value is
 * treated the same way — a corrupted column should not silently mute a phone.
 *
 * `test` is deliberately unswitchable. It only ever fires from a button the
 * user just pressed, and a test that can be muted tests nothing.
 */
export function wantsKind(kindsJson: string | null, kind: PushKind | undefined): boolean {
  if (!kindsJson || kind === undefined || kind === "test") return true;
  try {
    const parsed = JSON.parse(kindsJson) as unknown;
    if (!Array.isArray(parsed)) return true;
    return parsed.includes(kind);
  } catch {
    return true;
  }
}

/** Reads a device's switches. NULL column reads back as every kind. */
export function subscriptionKinds(endpoint: string): PushKind[] {
  const row = db
    .prepare(`SELECT kinds_json FROM push_subscriptions WHERE endpoint = ?`)
    .get(endpoint) as { kinds_json: string | null } | undefined;
  if (!row || !row.kinds_json) return [...PUSH_KINDS];
  try {
    const parsed = JSON.parse(row.kinds_json) as unknown;
    if (!Array.isArray(parsed)) return [...PUSH_KINDS];
    return PUSH_KINDS.filter((k) => parsed.includes(k));
  } catch {
    return [...PUSH_KINDS];
  }
}

/** Returns false when the endpoint is unknown, so the caller can 404. */
export function setSubscriptionKinds(endpoint: string, kinds: PushKind[]): boolean {
  const clean = PUSH_KINDS.filter((k) => kinds.includes(k));
  const res = db
    .prepare(`UPDATE push_subscriptions SET kinds_json = ? WHERE endpoint = ?`)
    .run(JSON.stringify(clean), endpoint);
  return res.changes > 0;
}

export function subscriptionCount(): number {
  const web = (
    db.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions`).get() as {
      n: number;
    }
  ).n;
  const native = (
    db
      .prepare(
        `SELECT COUNT(*) AS n
           FROM native_push_subscriptions n
           JOIN api_devices d ON d.id = n.device_id
          WHERE d.revoked_at IS NULL`,
      )
      .get() as { n: number }
  ).n;
  return web + native;
}

export interface NativeSubscriptionState {
  enabled: boolean;
  kinds: PushKind[];
}

/** Current native-device registration. Missing kinds means all, matching Web Push. */
export function nativeSubscription(deviceId: string): NativeSubscriptionState {
  const row = db
    .prepare(`SELECT kinds_json FROM native_push_subscriptions WHERE device_id = ?`)
    .get(deviceId) as { kinds_json: string | null } | undefined;
  return {
    enabled: Boolean(row),
    kinds: row ? parseKinds(row.kinds_json) : [...PUSH_KINDS],
  };
}

export function saveNativeSubscription(
  deviceId: string,
  installationId: string,
  kinds: PushKind[],
): NativeSubscriptionState {
  const now = Date.now();
  db.transaction(() => {
    // A re-pair creates a new device id but may retain the same Firebase
    // installation. Move it; never fan out twice to one app installation.
    db.prepare(
      `DELETE FROM native_push_subscriptions
        WHERE installation_id = ? AND device_id <> ?`,
    ).run(installationId, deviceId);
    db.prepare(
      `INSERT INTO native_push_subscriptions
         (device_id, installation_id, kinds_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         installation_id = excluded.installation_id,
         kinds_json = excluded.kinds_json,
         updated_at = excluded.updated_at`,
    ).run(deviceId, installationId, JSON.stringify(canonicalKinds(kinds)), now, now);
  })();
  return nativeSubscription(deviceId);
}

export function setNativeSubscriptionKinds(
  deviceId: string,
  kinds: PushKind[],
): NativeSubscriptionState | null {
  const result = db
    .prepare(
      `UPDATE native_push_subscriptions
          SET kinds_json = ?, updated_at = ?
        WHERE device_id = ?`,
    )
    .run(JSON.stringify(canonicalKinds(kinds)), Date.now(), deviceId);
  return result.changes > 0 ? nativeSubscription(deviceId) : null;
}

export function deleteNativeSubscription(deviceId: string): boolean {
  return (
    db.prepare(`DELETE FROM native_push_subscriptions WHERE device_id = ?`).run(deviceId)
      .changes > 0
  );
}

function canonicalKinds(kinds: PushKind[]): PushKind[] {
  return PUSH_KINDS.filter((kind) => kinds.includes(kind));
}

function parseKinds(raw: string | null): PushKind[] {
  if (!raw) return [...PUSH_KINDS];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? PUSH_KINDS.filter((kind) => parsed.includes(kind))
      : [...PUSH_KINDS];
  } catch {
    return [...PUSH_KINDS];
  }
}

export function saveSubscription(
  endpoint: string,
  keys: Record<string, string>,
  ua: string | null,
) {
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, keys_json, ua, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET keys_json = excluded.keys_json, ua = excluded.ua`,
  ).run(endpoint, JSON.stringify(keys), ua, Date.now());
}

export function deleteSubscription(endpoint: string) {
  db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
}

export interface SendResult {
  sent: number;
  failed: number;
  /** the push service's own reason for the last failure, for the test route */
  error: string | null;
}

/**
 * Fans a payload out to every stored subscription. Never throws: this is
 * called from the run lifecycle, and a dead phone must not fail a run.
 *
 * It reports what happened rather than only how many landed. A push that is
 * rejected by the push service is indistinguishable from one nobody looked at,
 * so without this the only symptom of a misconfiguration is silence — which is
 * also what working correctly looks like from the sending side.
 */
export async function sendToAll(payload: PushPayload): Promise<SendResult> {
  if (!notificationsConfigured) {
    return { sent: 0, failed: 0, error: "no push provider configured" };
  }
  const webRows = (
    db
      .prepare(`SELECT endpoint, keys_json, kinds_json FROM push_subscriptions`)
      .all() as WebSubscriptionRow[]
  ).filter((row) => wantsKind(row.kinds_json, payload.kind));
  const nativeRows = (
    db
      .prepare(
        `SELECT n.device_id, n.installation_id, n.kinds_json
           FROM native_push_subscriptions n
           JOIN api_devices d ON d.id = n.device_id
          WHERE d.revoked_at IS NULL`,
      )
      .all() as NativeSubscriptionRow[]
  ).filter((row) => wantsKind(row.kinds_json, payload.kind));
  if (webRows.length === 0 && nativeRows.length === 0) {
    return { sent: 0, failed: 0, error: null };
  }

  const webResult = pushConfigured
    ? await sendWebPush(payload, webRows)
    : { sent: 0, failed: 0, error: null };
  const nativeResult = nativePushConfigured
    ? await sendNativePush(payload, nativeRows)
    : { sent: 0, failed: 0, error: null };
  return {
    sent: webResult.sent + nativeResult.sent,
    failed: webResult.failed + nativeResult.failed,
    error: nativeResult.error ?? webResult.error,
  };
}

async function sendWebPush(
  payload: PushPayload,
  rows: WebSubscriptionRow[],
): Promise<SendResult> {
  if (rows.length === 0) return { sent: 0, failed: 0, error: null };
  const body = JSON.stringify({ ...payload, ts: Date.now() });
  let sent = 0;
  let failed = 0;
  let error: string | null = null;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: JSON.parse(row.keys_json) },
          body,
          { TTL: 60 * 60 },
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 mean the push service has retired this endpoint — the app
        // was uninstalled or permission revoked. Keeping the row would make
        // every future send pay for a guaranteed failure.
        failed += 1;
        error = describeFailure(err, status);
        if (status === 404 || status === 410) {
          deleteSubscription(row.endpoint);
        } else {
          console.error(`[push] send failed (${status ?? "?"}): ${error}`);
        }
      }
    }),
  );

  return { sent, failed, error };
}

function firebaseMessaging() {
  const app =
    getApps()[0] ??
    initializeApp({
      credential: applicationDefault(),
      projectId: FIREBASE_PROJECT_ID,
    });
  return getMessaging(app);
}

async function sendNativePush(
  payload: PushPayload,
  rows: NativeSubscriptionRow[],
): Promise<SendResult> {
  if (rows.length === 0) return { sent: 0, failed: 0, error: null };
  let sent = 0;
  let failed = 0;
  let error: string | null = null;
  const data = Object.fromEntries(
    Object.entries({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/",
      tag: payload.tag ?? "",
      kind: payload.kind ?? "run",
      ts: String(Date.now()),
    }).map(([key, value]) => [key, String(value)]),
  );

  try {
    const messaging = firebaseMessaging();
    for (let offset = 0; offset < rows.length; offset += 500) {
      const batch = rows.slice(offset, offset + 500);
      const response = await messaging.sendEachForMulticast({
        fids: batch.map((row) => row.installation_id),
        data,
        android: {
          priority: "high",
          ttl: 60 * 60 * 1000,
          collapseKey: payload.tag,
        },
      });
      sent += response.successCount;
      failed += response.failureCount;
      response.responses.forEach((result, index) => {
        if (result.success) return;
        const code = result.error?.code ?? "messaging/unknown-error";
        error = result.error?.message ?? code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/installation-id-not-registered"
        ) {
          db.prepare(
            `DELETE FROM native_push_subscriptions WHERE installation_id = ?`,
          ).run(batch[index].installation_id);
        } else {
          console.error(`[push] FCM send failed (${code}): ${error}`);
        }
      });
    }
  } catch (cause) {
    failed += rows.length;
    error = cause instanceof Error ? cause.message : "FCM send failed";
    console.error(`[push] FCM fan-out failed: ${error}`);
  }
  return { sent, failed, error };
}

/**
 * The push service's own words, where it gave any.
 *
 * Apple answers a bad VAPID subject with `{"reason":"BadJwtToken"}` and a
 * generic "Received unexpected response code" message, so the body is the only
 * part that says anything useful.
 */
function describeFailure(err: unknown, status: number | undefined): string {
  const body = (err as { body?: unknown }).body;
  let reason = "";
  if (typeof body === "string" && body.trim()) {
    try {
      const parsed = JSON.parse(body) as { reason?: unknown };
      reason = typeof parsed.reason === "string" ? parsed.reason : body.trim();
    } catch {
      reason = body.trim();
    }
  }
  const prefix = status ? `${status}` : "no response";
  return reason ? `${prefix} ${reason}` : prefix;
}
