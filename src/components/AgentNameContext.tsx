"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { APP_NAME } from "@/lib/branding";

/* What the agent is called, everywhere the reader sees it.
 *
 * Unlike preferences this is *not* per device — it is stored server-side in
 * `app_settings`, because push payloads are composed in Node and an agent with
 * a different name on the phone than on the Mac would be two agents. The
 * initial value is therefore read from SQLite in the root layout and handed
 * down as a prop: no fetch, no first-paint flash, no hydration mismatch.
 */

interface AgentNameValue {
  agentName: string;
  /** Persists the name and updates every surface. Returns what was stored —
   *  the server trims, collapses whitespace and falls back on empty. */
  setAgentName: (name: string) => Promise<string>;
}

const Context = createContext<AgentNameValue>({
  agentName: APP_NAME,
  setAgentName: async (name) => name,
});

export function AgentNameProvider({
  initial,
  children,
}: {
  initial: string;
  children: ReactNode;
}) {
  const [agentName, setName] = useState(initial);

  const setAgentName = useCallback(async (next: string) => {
    // Optimistic: the field should not lag a keystroke behind on a phone that
    // is a round trip away from its own server. Blank means "back to the
    // default", so show that rather than an empty speaker label.
    setName(next.trim() || APP_NAME);
    const res = await fetch("/api/settings/agent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    if (!res.ok) throw new Error(`save failed (${res.status})`);
    const body = (await res.json()) as { name: string };
    setName(body.name);
    return body.name;
  }, []);

  const value = useMemo(() => ({ agentName, setAgentName }), [agentName, setAgentName]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAgentName() {
  return useContext(Context).agentName;
}

export function useSetAgentName() {
  return useContext(Context).setAgentName;
}
