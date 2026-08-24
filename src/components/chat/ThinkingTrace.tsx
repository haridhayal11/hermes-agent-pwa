"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePreferences } from "@/components/PreferencesContext";
import { IconChevronDown, IconSparkle } from "@/components/primitives/icons";

/* ThinkingState's expandable trace, with the scripted STAGES sequence pulled
 * out. `working` and the reasoning text come from the run stream; the header
 * shimmers while the model is still thinking and freezes the measured
 * duration when it stops. Auto-expands on first thought, and stays wherever
 * the reader last put it. */

export function ThinkingTrace({
  text,
  working,
}: {
  text: string;
  working: boolean;
}) {
  const { prefs } = usePreferences();
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef<number | null>(null);
  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);

  // Changing the preference drops the manual override, so the setting takes
  // effect on the trace already on screen rather than only the next one.
  const [seenPref, setSeenPref] = useState(prefs.thinking);
  if (seenPref !== prefs.thinking) {
    setSeenPref(prefs.thinking);
    setManualExpanded(null);
  }

  // null means "not yet touched": follow the preference, and under the default
  // ("collapsed") fall back to the original behaviour of auto-opening while
  // the model is still thinking.
  const auto = prefs.thinking === "expanded" ? true : working;
  const expanded = manualExpanded ?? auto;

  useEffect(() => {
    if (!working) return;
    startRef.current ??= Date.now();
    const t = setInterval(() => {
      setSeconds(Math.round((Date.now() - (startRef.current ?? Date.now())) / 1000));
    }, 250);
    return () => clearInterval(t);
  }, [working]);

  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight);
  }, [text, expanded]);

  if (prefs.thinking === "hidden") return null;
  if (!text.trim()) return null;

  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualExpanded(!expanded)}
        className="-mx-1.5 flex h-8 w-fit items-center gap-2 rounded-control px-1.5
          transition-colors duration-100 hover:bg-hover-2 active:scale-[0.98]"
      >
        <span className={working ? "text-ink-2" : "text-ink-3"}>
          <IconSparkle size={15} />
        </span>
        <span role="status" className="contents">
          {working ? (
            <span
              className="bg-clip-text text-ui font-medium whitespace-nowrap text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
                backgroundSize: "200% 100%",
                animation: "shimmer-text 1.4s linear infinite",
              }}
            >
              Thinking
            </span>
          ) : (
            <span
              className="text-ui font-medium whitespace-nowrap text-ink-2"
              style={{ animation: "fade-in var(--duration-medium) ease-out both" }}
            >
              {seconds > 0 ? `Thought for ${seconds}s` : "Thought"}
            </span>
          )}
        </span>
        <span
          className="text-ink-3 transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
        >
          <IconChevronDown size={13} />
        </span>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-400"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: "var(--ease-out-strong)",
        }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[5px] pl-4">
            <span
              aria-hidden
              className="absolute left-[3px] w-px bg-line"
              style={{
                top: -8,
                height: lineHeight ? lineHeight - 2 : 0,
                transition: "height 500ms var(--ease-out-strong)",
              }}
            />
            <div ref={traceRef} className="flex flex-col gap-1 py-1">
              <p className="text-label whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">
                {text}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
