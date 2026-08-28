import { idempotentJson } from "@/lib/api/v1/idempotency";
import { error, json, withDevice } from "@/lib/api/v1/http";
import {
  deleteNativeSubscription,
  nativePushConfigured,
  nativeSubscription,
  saveNativeSubscription,
  setNativeSubscriptionKinds,
  subscriptionCount,
} from "@/lib/push";
import { PUSH_KINDS, type PushKind } from "@/lib/notification-kinds";

export const dynamic = "force-dynamic";

function response(deviceId: string) {
  const state = nativeSubscription(deviceId);
  return json({
    configured: nativePushConfigured,
    enabled: state.enabled,
    kinds: state.kinds,
    subscriptions: subscriptionCount(),
  });
}

function parseKinds(value: unknown, required: boolean): PushKind[] | null {
  if (value === undefined && !required) return [...PUSH_KINDS];
  if (!Array.isArray(value)) return null;
  if (value.some((kind) => typeof kind !== "string" || !PUSH_KINDS.includes(kind as PushKind))) {
    return null;
  }
  return PUSH_KINDS.filter((kind) => value.includes(kind));
}

function installationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (clean.length < 10 || clean.length > 512 || /\s|[\u0000-\u001f]/.test(clean)) {
    return null;
  }
  return clean;
}

export async function GET(request: Request) {
  return withDevice(request, (device) => response(device.id));
}

export async function PUT(request: Request) {
  return withDevice(request, async (device) => {
    if (!nativePushConfigured) {
      return error(503, "not_configured", "Firebase Cloud Messaging is not configured.");
    }
    const body = (await request.clone().json().catch(() => null)) as {
      installationId?: unknown;
      kinds?: unknown;
    } | null;
    const fid = installationId(body?.installationId);
    const kinds = parseKinds(body?.kinds, false);
    if (!fid || !kinds) {
      return error(400, "invalid_request", "A valid installationId and notification kinds are required.");
    }
    return idempotentJson(
      request,
      device.id,
      "PUT:/api/v1/notifications",
      async () => {
        const state = saveNativeSubscription(device.id, fid, kinds);
        return json({
          configured: true,
          enabled: state.enabled,
          kinds: state.kinds,
          subscriptions: subscriptionCount(),
        });
      },
    );
  });
}

export async function PATCH(request: Request) {
  return withDevice(request, async (device) => {
    const body = (await request.clone().json().catch(() => null)) as {
      kinds?: unknown;
    } | null;
    const kinds = parseKinds(body?.kinds, true);
    if (!kinds) return error(400, "invalid_request", "kinds must contain only supported notification kinds.");
    return idempotentJson(
      request,
      device.id,
      "PATCH:/api/v1/notifications",
      async () => {
        const state = setNativeSubscriptionKinds(device.id, kinds);
        if (!state) return error(404, "not_found", "This device is not registered for notifications.");
        return json({
          configured: nativePushConfigured,
          enabled: true,
          kinds: state.kinds,
          subscriptions: subscriptionCount(),
        });
      },
    );
  });
}

export async function DELETE(request: Request) {
  return withDevice(request, async (device) =>
    idempotentJson(
      request,
      device.id,
      "DELETE:/api/v1/notifications",
      async () => {
        deleteNativeSubscription(device.id);
        return response(device.id);
      },
    ),
  );
}
