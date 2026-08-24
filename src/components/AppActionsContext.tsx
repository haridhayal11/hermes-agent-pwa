"use client";

import { createContext, useContext, type ReactNode } from "react";

/* Shell-level affordances the thread needs to reach.
 *
 * Search is owned by AppShell (it spans projects, so it can't live in one
 * thread), but `/search` in the composer has to open it. Same shape as
 * RunStatusContext, which solves the mirror-image problem of the thread
 * needing to publish upward. */

interface AppActions {
  openSearch: () => void;
}

const Context = createContext<AppActions>({ openSearch: () => {} });

export function AppActionsProvider({
  openSearch,
  children,
}: AppActions & { children: ReactNode }) {
  return <Context.Provider value={{ openSearch }}>{children}</Context.Provider>;
}

export function useAppActions() {
  return useContext(Context);
}
