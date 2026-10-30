/* The number on the installed app's icon. iOS 16.4+ grants this to a Home
 * Screen web app that has notification permission, Chromium to any installed
 * one; everywhere else these are no-ops. Never throws: a badge that fails to
 * set is not worth an error anywhere. */

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function showAppBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as BadgeNavigator;
  try {
    if (count > 0) void nav.setAppBadge?.(count)?.catch(() => {});
    else void nav.clearAppBadge?.()?.catch(() => {});
  } catch {
    // unsupported, or refused without permission
  }
}
