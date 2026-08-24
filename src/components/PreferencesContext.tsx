"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULTS,
  PREFS_KEY,
  applyPrefsToDocument,
  readPrefs,
  systemReducedMotion,
  writePrefs,
  type Preferences,
} from "@/lib/preferences";

/* Preferences are read from localStorage, which the server cannot see. The
 * first render — server and client alike — therefore uses DEFAULTS, and the
 * stored values are applied in a layout effect, before paint. Initialising
 * from localStorage directly would be a hydration mismatch on every
 * pref-dependent control on /settings.
 *
 * The CSS-driven prefs (theme, text size, reduced motion) don't wait for
 * that: the blocking script in layout.tsx has already put them on <html>
 * before the first pixel, so there is no flash to correct. */

interface PreferencesValue {
  prefs: Preferences;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  /** false until localStorage has been read — guards first-render-only UI */
  hydrated: boolean;
  /** our toggle OR the OS setting */
  reduceMotion: boolean;
}

const Context = createContext<PreferencesValue>({
  prefs: DEFAULTS,
  setPref: () => {},
  hydrated: false,
  reduceMotion: false,
});

// useLayoutEffect logs on the server; this component renders there.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);
  const [systemReduce, setSystemReduce] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const stored = readPrefs();
    setPrefs(stored);
    setSystemReduce(systemReducedMotion());
    setHydrated(true);
    applyPrefsToDocument(stored);
  }, []);

  // `theme: "system"` and the OS motion setting both have to keep tracking
  // the OS after load, not just at mount.
  useEffect(() => {
    const colour = window.matchMedia("(prefers-color-scheme: dark)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      setSystemReduce(motion.matches);
      applyPrefsToDocument(readPrefs());
    };
    colour.addEventListener("change", onChange);
    motion.addEventListener("change", onChange);
    return () => {
      colour.removeEventListener("change", onChange);
      motion.removeEventListener("change", onChange);
    };
  }, []);

  // Another tab (or the Mac alongside the phone, on the same origin) writing
  // prefs should be reflected here rather than silently diverging.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== PREFS_KEY) return;
      const stored = readPrefs();
      setPrefs(stored);
      applyPrefsToDocument(stored);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPref = useCallback<PreferencesValue["setPref"]>((key, value) => {
    setPrefs((current) => {
      const next = { ...current, [key]: value };
      writePrefs(next);
      applyPrefsToDocument(next);
      return next;
    });
  }, []);

  const value = useMemo<PreferencesValue>(
    () => ({
      prefs,
      setPref,
      hydrated,
      reduceMotion: prefs.reduceMotion || systemReduce,
    }),
    [prefs, setPref, hydrated, systemReduce],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePreferences() {
  return useContext(Context);
}
