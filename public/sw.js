/* The service worker.
 *
 * Push only — there is deliberately no fetch handler and no precache. The app
 * is served over the tailnet from the same laptop the agent runs on, so an
 * offline shell would render a chat that cannot send, load history, or stream.
 * A blank "can't reach the server" is the more honest failure.
 *
 * Served with Cache-Control: no-store (next.config.ts), so an updated worker
 * is picked up on the next visit rather than on the browser's own schedule.
 */

self.addEventListener("install", () => {
  // Take over immediately; there is no old worker whose in-flight work matters.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Hermes";
  const options = {
    body: payload.body || "",
    // Same tag per project, so a burst of runs coalesces into one row in
    // Notification Center instead of burying everything else.
    tag: payload.tag || "hermes-pwa",
    renotify: Boolean(payload.tag),
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.url || "/" },
    // Both of these mean the thread has stopped and is waiting on a person —
    // an approval blocks the run outright, and a question card ends the run
    // without ending the task. Neither should auto-dismiss itself away.
    requireInteraction:
      payload.kind === "approval" || payload.kind === "question",
    timestamp: payload.ts || Date.now(),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an open window and route it, rather than opening a second copy
      // of an installed PWA — iOS will happily end up with two.
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              // cross-origin or a client that refuses navigation
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
