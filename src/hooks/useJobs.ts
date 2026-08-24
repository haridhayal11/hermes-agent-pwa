"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_NAME } from "@/lib/branding";
import type { HermesJob } from "@/lib/hermes";

/* The scheduled-jobs list.
 *
 * `unavailable` is a first-class state, not an error: Hermes only registers
 * /api/jobs when its cron module imported cleanly, and /v1/capabilities is no
 * help — it reports `jobs_admin: false` as a hardcoded literal while the whole
 * surface is live, and leaves /api/jobs out of its endpoint map entirely. A
 * real request is the only honest probe.
 */

export interface JobBinding {
  job_id: string;
  project_id: string;
  project_name?: string;
}

export type Job = HermesJob & { binding: JobBinding | null };

export function useJobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/jobs");
        const body = (await res.json()) as {
          jobs?: Job[];
          unavailable?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? `${res.status}`);
          setJobs([]);
          return;
        }
        setUnavailable(Boolean(body.unavailable));
        setJobs(body.jobs ?? []);
        setError(null);
      } catch {
        if (!cancelled) {
          setError(`Could not reach ${APP_NAME}`);
          setJobs([]);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return {
    jobs,
    unavailable,
    error,
    refresh: useCallback(() => setReload((n) => n + 1), []),
  };
}
