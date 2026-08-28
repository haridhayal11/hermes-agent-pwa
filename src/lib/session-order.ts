import type { ProjectSession } from "./chat-types";

/** Stable conversation ordering shared by the PWA's server and client views. */
export function compareSessionsRecentFirst(
  left: ProjectSession,
  right: ProjectSession,
): number {
  return (
    right.last_active_at - left.last_active_at ||
    right.created_at - left.created_at ||
    left.session_id.localeCompare(right.session_id)
  );
}

export function sessionsRecentFirst(
  sessions: readonly ProjectSession[],
): ProjectSession[] {
  return [...sessions].sort(compareSessionsRecentFirst);
}
