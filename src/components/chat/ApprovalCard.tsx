"use client";

import { useState } from "react";
import { useAgentName } from "@/components/AgentNameContext";
import type { PendingApproval } from "@/lib/chat-types";
import { IconCheck, IconCross } from "@/components/primitives/icons";

/* ApprovalCard rebuilt against Hermes's real approval contract
 * (api_server.py `_handle_run_approval` — choice is once | session | always |
 * deny, plus an optional `all`). The library version was a three-question
 * survey with its own pager; the shape it left behind — card, question,
 * choice rows, footer action — is what's reused here.
 *
 * The event carries more than the command: `description` is the human
 * sentence Hermes wrote for the call, and `pattern_key` is the allowlist
 * entry that "always" will actually persist. Showing the key matters — it is
 * usually broader than the one command in front of you, and agreeing to it
 * blind is how an allowlist grows teeth. */

const CHOICE_COPY: Record<string, { label: string; hint: string }> = {
  once: { label: "Allow once", hint: "This call only" },
  session: { label: "Allow for session", hint: "Until this session ends" },
  always: { label: "Always allow", hint: "Remembered across sessions" },
  deny: { label: "Deny", hint: "Refuse and continue" },
};

export function ApprovalCard({
  approval,
  onRespond,
}: {
  approval: PendingApproval;
  onRespond: (choice: string, all: boolean) => void;
}) {
  /* Hermes coalesces identical approvals behind one prompt, but a turn that
   * fires several *different* dangerous calls asks several times. `all`
   * resolves the whole pending set with this answer in one go. */
  const [all, setAll] = useState(false);
  const agentName = useAgentName();

  const choices = approval.choices.filter((c) => c in CHOICE_COPY);
  const rendered = choices.length > 0 ? choices : ["once", "deny"];
  const persists = rendered.includes("always") && approval.patternKey;

  return (
    <div
      className={`w-full overflow-hidden rounded-card shadow-card ${
        approval.smartDenied ? "bg-red-tint" : "bg-surface"
      }`}
      style={{ animation: "pop-in var(--duration-fast) var(--ease-out-strong) both" }}
    >
      <div className="primitive-card-pad">
        <div className="flex items-start justify-between gap-3">
          <span className="text-ui font-medium text-ink">
            {approval.smartDenied
              ? `${agentName} was blocked and is asking you to override`
              : `${agentName} wants to run something`}
          </span>
          <span
            className={`shrink-0 rounded-chip px-1.5 py-0.5 text-meta font-medium ${
              approval.smartDenied
                ? "bg-red text-white"
                : "bg-orange-tint text-orange"
            }`}
          >
            {approval.smartDenied ? "Blocked" : "Waiting"}
          </span>
        </div>

        {approval.description && (
          <p className="mt-1.5 text-ui leading-[1.5] text-ink-2 [overflow-wrap:anywhere]">
            {approval.description}
          </p>
        )}

        {approval.command && (
          <pre className="mt-2 max-h-40 overflow-auto rounded-control bg-inset px-2.5 py-2 font-mono text-meta leading-[1.7] whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">
            {approval.command}
          </pre>
        )}

        {persists && (
          <p className="mt-2 flex flex-wrap items-baseline gap-1.5 text-meta text-ink-3">
            <span>&ldquo;Always&rdquo; remembers</span>
            <span className="rounded-chip bg-field px-1.5 py-0.5 font-mono text-meta text-ink-2 [overflow-wrap:anywhere]">
              {approval.patternKey}
            </span>
          </p>
        )}

        <div className="mt-2 flex flex-col gap-0.5">
          {rendered.map((choice) => {
            const copy = CHOICE_COPY[choice] ?? { label: choice, hint: "" };
            const deny = choice === "deny";
            return (
              <button
                key={choice}
                type="button"
                onClick={() => onRespond(choice, all)}
                className="-mx-1.5 flex w-[calc(100%+12px)] items-center gap-2 rounded-control px-1.5 py-1.5
                  text-left transition-colors duration-100 hover:bg-hover active:scale-[0.99]"
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full text-white ${
                    deny ? "bg-red" : "bg-green"
                  }`}
                >
                  {deny ? <IconCross size={11} strokeWidth={3} /> : <IconCheck size={12} strokeWidth={3} />}
                </span>
                <span className="text-ui font-medium text-ink">{copy.label}</span>
                <span className="ml-auto text-meta text-ink-3">{copy.hint}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-pressed={all}
          className="-mx-1.5 mt-1 flex w-[calc(100%+12px)] items-center gap-2 rounded-control px-1.5 py-1.5
            text-left transition-colors duration-100 hover:bg-hover-2 active:scale-[0.99]"
        >
          <span
            className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-100 ${
              all ? "border-transparent bg-ink text-page" : "border-line-strong text-transparent"
            }`}
          >
            <IconCheck size={10} strokeWidth={3} />
          </span>
          <span className="text-meta text-ink-2">
            Apply to every approval waiting on this turn
          </span>
        </button>
      </div>
    </div>
  );
}
