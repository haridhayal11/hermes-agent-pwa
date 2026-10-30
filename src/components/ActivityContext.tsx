"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Activity, ActivityItem, ActivityState } from "@/lib/activity";
import { showAppBadge } from "@/lib/app-badge";

/* What is happening across every project: the notifications feed, and the
 * per-chat states the sidebar draws as dots. Mounted in the root layout so it survives
 * navigation — AppShell is per page and remounts on every route change.
 *
 * It refetches rather than patching itself from events. The snapshot is one
 * small query, and a phone that was suspended has missed events it can never
 * get back; re-reading on visibility is what makes it correct after a lock. */

interface ActivityValue {
  activity: Activity | null;
  /** the most pressing state per chat */
  bySession: Map<string, ActivityItem>;
  /** the most pressing state across a project's chats */
  byProject: Map<string, ActivityState>;
  refresh: () => void;
}

const EMPTY: ActivityValue = {
  activity: null,
  bySession: new Map(),
  byProject: new Map(),
  refresh: () => {},
};

const Context = createContext<ActivityValue>(EMPTY);

const RANK: Record<ActivityState, number> = {
  approval: 0,
  question: 1,
  running: 2,
  failed: 3,
  unseen: 4,
};

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);

  // One read at a time; anything asked for meanwhile gets one more pass.
  const load = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        try {
          const response = await fetch("/api/activity", { cache: "no-store" });
          if (response.ok) setActivity((await response.json()) as Activity);
        } catch {
          // offline: keep the last snapshot rather than blanking the dots
        }
      } while (again.current);
    } finally {
      inFlight.current = false;
    }
  }, []);

  // A run's transitions arrive in bursts (queued, running, completed within a
  // second for a short turn); one read covers them.
  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), 250);
  }, [load]);

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  useEffect(() => {
    if (activity) showAppBadge(activity.badge);
  }, [activity]);

  const value = useMemo<ActivityValue>(() => {
    const bySession = new Map<string, ActivityItem>();
    const byProject = new Map<string, ActivityState>();
    for (const item of activity?.items ?? []) {
      bySession.set(item.sessionId, item);
      const current = byProject.get(item.projectId);
      if (!current || RANK[item.state] < RANK[current]) byProject.set(item.projectId, item.state);
    }
    return { activity, bySession, byProject, refresh };
  }, [activity, refresh]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useActivity() {
  return useContext(Context);
}
