"use client";

import { useCallback, useEffect, useRef } from "react";

export interface StreamEvent {
  run_id: string;
  seq: number;
  ts: number;
  event: string;
  [key: string]: unknown;
}

/**
 * Subscribes to /api/projects/[id]/stream — our replay-then-live SSE, not
 * Hermes's directly. Reconnects with ?after_seq= on drop and on the tab
 * regaining visibility (phone lock / background causes both).
 *
 * Returns `reconnect()` for callers to force a fresh connection right after
 * starting a run — a stream opened while no run existed yet resolves to a
 * static "nothing to show" branch server-side and won't discover a run that
 * starts later on its own.
 */
export function useRunStream(
  projectId: string,
  sessionId: string,
  onEvent: (evt: StreamEvent) => void,
) {
  const lastSeqRef = useRef(-1);
  const onEventRef = useRef(onEvent);
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let source: EventSource | null = null;
    let disposed = false;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (disposed) return;
      source?.close();
      if (retryTimer) clearTimeout(retryTimer);
      const url = `/api/projects/${projectId}/sessions/${sessionId}/events?after_seq=${lastSeqRef.current}`;
      source = new EventSource(url);

      source.onmessage = (e) => {
        retryDelay = 1000;
        try {
          const parsed = JSON.parse(e.data) as StreamEvent;
          if (typeof parsed.seq === "number") lastSeqRef.current = parsed.seq;
          onEventRef.current(parsed);
        } catch {
          // ignore malformed frame
        }
      };

      source.onerror = () => {
        source?.close();
        if (disposed) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
      };
    }
    connectRef.current = connect;

    function onVisibility() {
      if (document.visibilityState === "visible") connect();
    }

    connect();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [projectId, sessionId]);

  return {
    reconnect: useCallback(() => connectRef.current(), []),
  };
}
