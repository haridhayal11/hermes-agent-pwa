import { APP_NAME, APP_SLUG } from "@/lib/branding";
import { error, json, withDevice } from "@/lib/api/v1/http";
import {
  nativePushConfigured,
  nativeSubscription,
  sendToAll,
  subscriptionCount,
} from "@/lib/push";

export async function POST(request: Request) {
  return withDevice(request, async (device) => {
    if (!nativePushConfigured) {
      return error(503, "not_configured", "Firebase Cloud Messaging is not configured.");
    }
    if (!nativeSubscription(device.id).enabled) {
      return error(409, "not_subscribed", "Enable notifications on this device first.");
    }
    if (subscriptionCount() === 0) {
      return error(409, "no_subscriptions", "No devices are subscribed.");
    }
    const result = await sendToAll({
      title: APP_NAME,
      body: "Notifications are working.",
      url: "/",
      tag: `${APP_SLUG}-test`,
      kind: "test",
    });
    if (result.sent === 0 && result.failed > 0) {
      return error(502, "delivery_failed", result.error ?? "The push service refused the notification.");
    }
    return json(result);
  });
}
