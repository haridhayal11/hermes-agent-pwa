"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { RunPhase } from "@/lib/chat-types";

/* The live run phase belongs to the thread, but the header dot that reports it
 * lives in the shell — a parent. Rather than lift the whole stream hook up out
 * of ChatThread (where it is correctly scoped to a project), the thread
 * publishes just its phase here and the header subscribes. */

type RunStatus = { phase: RunPhase; setPhase: (phase: RunPhase) => void };

const Context = createContext<RunStatus>({ phase: "idle", setPhase: () => {} });

export function RunStatusProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<RunPhase>("idle");
  // memoised, or every consumer re-renders on each shell render
  const value = useMemo(() => ({ phase, setPhase }), [phase]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRunStatus() {
  return useContext(Context);
}
