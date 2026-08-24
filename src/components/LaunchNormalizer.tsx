"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_SLUG } from "@/lib/branding";

/* What the home screen icon opens.
 *
 * iOS Safari's Add to Home Screen pins the URL of the page you were on. It
 * does not use the manifest's `start_url`, and there is no way to ask it to —
 * so installing from a project (which is nearly always, since `/` redirects
 * straight into the most recent one) bolts the icon to that project forever.
 * Delete the project and the app launches into a 404.
 *
 * So the app corrects it on the way in: a cold launch of the installed web app
 * goes to `/`, and `/` picks the most recently active project. The icon
 * behaves like a home button rather than a bookmark.
 *
 * Everything here is a guard against doing that at the wrong moment:
 *
 *  - `sessionStorage` marks the app session, so this is a *launch* correction
 *    and not something that fires on every navigation. A reload keeps the
 *    marker; a kill-and-relaunch does not, which is exactly the line we want.
 *  - the navigation type excludes reloads and back/forward, which keep the URL
 *    the user asked for.
 *  - a browser tab is left alone entirely. There the URL is the user's.
 *  - `?n=1` means the service worker opened this window from a notification
 *    tap, and that is a deep link — bouncing it to `/` would defeat the whole
 *    point of the notification. The marker is stripped once read.
 */
const LAUNCH_KEY = `${APP_SLUG}:launched`;

export function LaunchNormalizer() {
  const router = useRouter();

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = sessionStorage.getItem(LAUNCH_KEY);
      sessionStorage.setItem(LAUNCH_KEY, "1");
    } catch {
      // Private mode, or storage denied. Without the marker we cannot tell a
      // launch from a navigation, so do nothing at all.
      return;
    }
    if (seen) return;

    const [nav] = performance.getEntriesByType("navigation") as
      PerformanceNavigationTiming[];
    if (nav && nav.type !== "navigate") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("n") === "1") {
      url.searchParams.delete("n");
      history.replaceState(null, "", `${url.pathname}${url.search}`);
      return;
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    if (url.pathname === "/") return;
    router.replace("/");
  }, [router]);

  return null;
}
