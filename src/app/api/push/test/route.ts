import { APP_NAME, APP_SLUG } from "@/lib/branding";
import { notificationsConfigured, sendToAll, subscriptionCount } from "@/lib/push";

export async function POST() {
  if (!notificationsConfigured) {
    return Response.json(
      { error: "No push provider is configured on the server" },
      { status: 503 },
    );
  }
  if (subscriptionCount() === 0) {
    return Response.json({ error: "no devices are subscribed" }, { status: 409 });
  }
  const result = await sendToAll({
    title: APP_NAME,
    body: "Notifications are working.",
    url: "/",
    tag: `${APP_SLUG}-test`,
    kind: "test",
  });

  /* A test that lands nowhere has to say so. Reporting only `sent` made a
   * rejected push look exactly like a successful one from the settings screen,
   * which is how a 403 from Apple went unnoticed — the button did nothing and
   * nothing said why. */
  if (result.sent === 0 && result.failed > 0) {
    return Response.json(
      { error: `The push service refused it: ${result.error ?? "unknown"}` },
      { status: 502 },
    );
  }
  return Response.json(result);
}
