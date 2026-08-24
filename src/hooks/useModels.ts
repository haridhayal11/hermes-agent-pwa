"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModelsPayload } from "@/app/api/models/route";

/* Hermes' model inventory, plus the model the gateway actually runs.
 *
 * Fetched once per mount rather than lazily on picker-open, because the
 * composer's model chip needs the resolved default before anyone taps
 * anything — and "hermes-agent", which is what /v1/capabilities reports, is a
 * virtual alias rather than an answer.
 *
 * The route memoises for ten minutes, so this is one warm request per project
 * open. On a cold cache it can take a while (Hermes enriches with provider
 * catalogues and pricing), which is why every consumer has to tolerate null.
 */
export function useModels() {
  const [payload, setPayload] = useState<ModelsPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((r) => r.json())
      .then((body: ModelsPayload) => {
        if (!cancelled) setPayload(body);
      })
      .catch(() => {
        if (!cancelled) {
          setPayload({ providers: [], current: { model: null, provider: null }, unavailable: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/models?refresh=1");
      setPayload((await res.json()) as ModelsPayload);
    } catch {
      /* keep whatever is on screen — a stale list beats an empty one */
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { payload, refreshing, refresh };
}
