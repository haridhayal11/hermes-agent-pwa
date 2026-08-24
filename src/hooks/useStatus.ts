"use client";

import { useEffect, useState } from "react";

/* Reads /api/status — /health + /v1/capabilities + the run table.
 *
 * This used to be a rail rendered at the foot of the sidebar, then at the foot
 * of the project edit sheet once the sidebar went. It has a home now:
 * /settings → Connection. Only the hook survived the move.
 *
 * The capability payload shape isn't pinned by the docs, so every field is
 * probed defensively.
 *
 * `features` is the important part: Hermes versions differ, and /v1/capabilities
 * is the only honest way to know whether this instance can steer, fork, or
 * list model options. Everything gated on it hides rather than 404s on an
 * older gateway. */

interface StatusPayload {
  hermes: {
    reachable: boolean;
    capabilities: Record<string, unknown> | null;
  };
  active_runs: { run_id: string }[];
}

/**
 * The subset of `capabilities.features` this app acts on. Absent means
 * "assume no" — an old gateway advertises nothing and must not be offered a
 * button that answers 404.
 */
export interface HermesFeatures {
  run_steer: boolean;
  model_options: boolean;
  session_fork: boolean;
  skills_api: boolean;
  toolsets: boolean;
}

const NO_FEATURES: HermesFeatures = {
  run_steer: false,
  model_options: false,
  session_fork: false,
  skills_api: false,
  toolsets: false,
};

function readFeatures(capabilities: Record<string, unknown> | null): HermesFeatures {
  const raw = capabilities?.features;
  if (!raw || typeof raw !== "object") return NO_FEATURES;
  const f = raw as Record<string, unknown>;
  const on = (key: string) => f[key] === true;
  return {
    run_steer: on("run_steer"),
    model_options: on("model_options"),
    session_fork: on("session_fork"),
    skills_api: on("skills_api"),
    // 0.20.5 exposes GET /v1/toolsets but does not name it in `features`;
    // the endpoints map is where it shows up.
    toolsets:
      on("toolsets") ||
      Boolean(
        capabilities &&
          typeof capabilities.endpoints === "object" &&
          capabilities.endpoints !== null &&
          "toolsets" in (capabilities.endpoints as Record<string, unknown>),
      ),
  };
}

function readModel(capabilities: Record<string, unknown> | null): string | null {
  if (!capabilities) return null;
  for (const key of ["model", "default_model", "current_model"]) {
    const value = capabilities[key];
    if (typeof value === "string" && value) return value;
    if (value && typeof value === "object" && "id" in value) {
      const id = (value as { id?: unknown }).id;
      if (typeof id === "string") return id;
    }
  }
  return null;
}

export function useStatus(pollMs = 20_000) {
  const [status, setStatus] = useState<StatusPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/status");
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as StatusPayload;
        if (!cancelled) setStatus(body);
      } catch {
        if (!cancelled) {
          setStatus({ hermes: { reachable: false, capabilities: null }, active_runs: [] });
        }
      }
    };
    void load();
    const t = setInterval(load, pollMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollMs]);

  return {
    reachable: status?.hermes.reachable ?? false,
    model: readModel(status?.hermes.capabilities ?? null),
    features: readFeatures(status?.hermes.capabilities ?? null),
    activeRuns: status?.active_runs.length ?? 0,
    loaded: status !== null,
  };
}
