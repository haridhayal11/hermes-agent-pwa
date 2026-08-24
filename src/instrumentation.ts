/* Server boot.
 *
 * `register()` runs once per Next.js server instance, before the first request
 * — which is the only hook this app has for something that must be running
 * whether or not anyone has opened a page. The cron watcher is exactly that:
 * a job fires on Hermes' schedule, not on a visit, and a poller that only
 * started when someone loaded the app would miss every overnight run.
 *
 * Two guards. `NEXT_RUNTIME` keeps it out of the edge runtime, which has no
 * timers worth the name and no better-sqlite3. `NEXT_PHASE` keeps it out of
 * `next build`, which spins up parallel workers to collect routes — each one
 * would otherwise open its own poller against the gateway.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startCronWatcher } = await import("./lib/cron-watcher");
  startCronWatcher();
}
