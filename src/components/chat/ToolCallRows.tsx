"use client";

import { useState } from "react";
import type { ToolCall } from "@/lib/chat-types";
import { usePreferences } from "@/components/PreferencesContext";
import { IconChevronDown, IconFile, IconTerminal, IconWrench } from "@/components/primitives/icons";

/* ToolChips' row grammar — icon, label, inline chip, expandable detail —
 * fed by tool.started / tool.progress / tool.completed instead of the
 * component's hardcoded ROWS and STEP_MS walkthrough. The file-diff chip
 * strip is dropped: Hermes doesn't send per-file diff stats on /v1/runs. */

function toolIcon(name: string) {
  if (/bash|shell|run|exec|command/i.test(name)) return <IconTerminal size={13} />;
  if (/read|write|edit|file|glob|grep/i.test(name)) return <IconFile size={13} />;
  return <IconWrench size={13} />;
}

function statusDot(status: ToolCall["status"]) {
  if (status === "running") {
    return (
      <span
        className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
        style={{ animation: "spin 700ms linear infinite" }}
      />
    );
  }
  if (status === "failed") {
    return <span className="size-2 shrink-0 rounded-full bg-red" />;
  }
  return <span className="size-2 shrink-0 rounded-full bg-green" />;
}

function ToolRow({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const detail = tool.detail.filter((line) => line.trim().length > 0);
  const expandable = detail.length > 0;

  return (
    <div style={{ animation: "fade-up var(--duration-medium) var(--ease-out-strong) both" }}>
      <button
        type="button"
        aria-expanded={open}
        disabled={!expandable}
        onClick={() => setOpen((current) => !current)}
        className="group/row -mx-1 flex min-h-8 w-[calc(100%+8px)] min-w-0 items-center gap-2
          rounded-control px-1 text-left transition-colors duration-100
          enabled:hover:bg-hover-2 enabled:active:bg-hover disabled:cursor-default"
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center text-ink-3">
          <span
            className={`transition-opacity duration-100 ${
              expandable ? "group-hover/row:opacity-0" : ""
            } ${open ? "opacity-0" : ""}`}
          >
            {toolIcon(tool.name)}
          </span>
          {expandable && (
            <span
              className={`absolute text-ink-3 transition-[opacity,transform] duration-150 group-hover/row:opacity-100 ${
                open ? "opacity-100" : "opacity-0"
              }`}
              style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
            >
              <IconChevronDown size={12} />
            </span>
          )}
        </span>

        <span className="shrink-0 font-mono text-label font-medium text-ink">
          {tool.name}
        </span>

        {tool.preview && (
          <span className="inline-flex h-6 min-w-0 flex-1 items-center truncate rounded-chip bg-field px-2 font-mono text-meta text-ink-2 shadow-hairline">
            {tool.preview}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center pl-1.5">
          {statusDot(tool.status)}
        </span>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transitionTimingFunction: "var(--ease-out-strong)",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-0.5 mb-1 ml-2 flex flex-col gap-0.5 border-l border-line py-0.5 pl-3.5">
            {detail.map((line, i) => (
              <span
                key={i}
                className="font-mono text-meta leading-[1.6] whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]"
              >
                {line}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToolCallRows({ tools }: { tools: ToolCall[] }) {
  const { prefs } = usePreferences();
  // null means "not yet touched": follow the preference. Reading it in a
  // useState initialiser instead would capture it at mount and never look
  // again — which is why changing the setting used to do nothing to a block
  // already on screen. ChatThread keys this component on the run id, so the
  // next run gets the preference back rather than inheriting a stray tap.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);

  // Changing the preference drops the manual override — otherwise one tap on
  // the block makes the setting inert for the rest of the run, which is
  // exactly the "it does nothing" this fixes.
  const [seenPref, setSeenPref] = useState(prefs.toolCalls);
  if (seenPref !== prefs.toolCalls) {
    setSeenPref(prefs.toolCalls);
    setManualOpen(null);
  }

  const open = manualOpen ?? prefs.toolCalls !== "collapsed";

  if (prefs.toolCalls === "hidden") return null;
  if (tools.length === 0) return null;

  const running = tools.filter((t) => t.status === "running").length;

  return (
    <div className="w-full pb-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setManualOpen(!open)}
        className="-mx-1.5 flex h-8 w-fit items-center gap-1.5 rounded-control px-1.5
          text-label text-ink-2 transition-colors duration-100 hover:bg-hover-2 active:scale-[0.98]"
      >
        <span
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          <IconChevronDown size={12} />
        </span>
        <span className="tabular-nums">
          {tools.length} tool call{tools.length === 1 ? "" : "s"}
          {running > 0 ? ` · ${running} running` : ""}
        </span>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="-mx-1 overflow-hidden px-1.5 pb-1">
          <div className="mt-1.5 flex flex-col gap-1">
            {tools.map((tool) => (
              <ToolRow key={tool.id} tool={tool} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
