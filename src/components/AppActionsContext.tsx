"use client";

import { createContext, useContext, type ReactNode } from "react";

/* Shell-level affordances the thread needs to reach.
 *
 * Search is owned by AppShell (it spans projects, so it can't live in one
 * thread), but `/search` in the composer has to open it. The project panels
 * are the same: the header menu and a slash command both open them, and only
 * the shell sits above both. Same shape as RunStatusContext, which solves the
 * mirror-image problem of the thread needing to publish upward. */

export type ProjectPanel =
  | { kind: "files" }
  | { kind: "diff" }
  /** `query` prefills the filter; `resume` brings in a lone exact title match
   *  directly, which is what `/resume <name>` asks for */
  | { kind: "import"; query?: string; resume?: boolean };

interface AppActions {
  openSearch: () => void;
  openPanel: (panel: ProjectPanel) => void;
}

const Context = createContext<AppActions>({ openSearch: () => {}, openPanel: () => {} });

export function AppActionsProvider({
  openSearch,
  openPanel,
  children,
}: AppActions & { children: ReactNode }) {
  return <Context.Provider value={{ openSearch, openPanel }}>{children}</Context.Provider>;
}

export function useAppActions() {
  return useContext(Context);
}
