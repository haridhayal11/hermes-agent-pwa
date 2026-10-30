"use client";

import { useEffect, useRef, useState } from "react";
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
  attention = false,
  onAttended,
}: {
  approval: PendingApproval;
  onRespond: (choice: string, all: boolean) => void;
  /** arrived from the approval's own notification: take focus and say so */
  attention?: boolean;
  onAttended?: () => void;
}) {
  /* Hermes coalesces identical approvals behind one prompt, but a turn that
   * fires several *different* dangerous calls asks several times. `all`
   * resolves the whole pending set with this answer in one go. */
  const [all, setAll] = useState(false);
  const agentName = useAgentName();

  const choices = approval.choices.filter((c) => c in CHOICE_COPY);
  const rendered = choices.length > 0 ? choices : ["once", "deny"];
  const persists = rendered.includes("always") && approval.patternKey;

  /* Tapping the notification should land on the decision, not near it. The
   * first choice takes focus — a keyboard can answer at once — and the card
   * draws an orange ring briefly, the hue that means "this is waiting on you". */
  const firstChoice = useRef<HTMLButtonElement>(null);
  const [ringed, setRinged] = useState(false);
  useEffect(() => {
    if (!attention) return;
    const button = firstChoice.current;
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest" });
    // No cleanup: onAttended drops the link's parameter, which turns
    // `attention` off again, and that must not cancel the ring mid-flash.
    setTimeout(() => setRinged(true), 0);
    setTimeout(() => setRinged(false), 1600);
    onAttended?.();
  }, [attention, onAttended]);

  return (
    <div
      className={`w-full overflow-hidden rounded-card shadow-card ${
        approval.smartDenied ? "bg-red-tint" : "bg-surface"
      }`}
      style={{
        animation: "pop-in var(--duration-fast) var(--ease-out-strong) both",
        // An outline, not a ring: shadow-card owns box-shadow outright.
        outline: "2px solid",
        outlineOffset: "-2px",
        outlineColor: ringed ? "var(--orange)" : "transparent",
        transition: "outline-color var(--duration-slow) var(--ease-out-strong)",
      }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="text-ui font-semibold text-balance text-ink">
            {approval.smartDenied
              ? `${agentName} was blocked and is asking you to override`
              : `${agentName} wants to run something`}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-meta font-medium ${
              approval.smartDenied
                ? "bg-red text-white"
                : "bg-orange-tint text-orange"
            }`}
          >
            {approval.smartDenied ? "Blocked" : "Waiting"}
          </span>
        </div>

        {approval.description && (
          <p className="mt-2 text-ui leading-[1.55] text-ink-2 [overflow-wrap:anywhere]">
            {approval.description}
          </p>
        )}

        {approval.command && (
          <pre className="scroll-area mt-3 max-h-40 overflow-auto rounded-control bg-inset px-3 py-2.5 font-mono text-label leading-[1.6] whitespace-pre-wrap text-ink shadow-hairline [overflow-wrap:anywhere]">
            {approval.command}
          </pre>
        )}

        {persists && (
          <p className="mt-2.5 flex flex-wrap items-baseline gap-1.5 text-label text-ink-3">
            <span>&ldquo;Always&rdquo; remembers</span>
            <span className="rounded-[6px] bg-field px-1.5 py-0.5 font-mono text-meta text-ink-2 [overflow-wrap:anywhere]">
              {approval.patternKey}
            </span>
          </p>
        )}

        <div className="mt-3 flex flex-col gap-0.5">
          {rendered.map((choice, index) => {
            const copy = CHOICE_COPY[choice] ?? { label: choice, hint: "" };
            const deny = choice === "deny";
            return (
              <button
                key={choice}
                ref={index === 0 ? firstChoice : undefined}
                type="button"
                onClick={() => onRespond(choice, all)}
                className="-mx-2 flex min-h-10 w-[calc(100%+16px)] items-center gap-2.5 rounded-control px-2 py-1.5
                  text-left transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.99]"
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full text-white ${
                    deny ? "bg-red" : "bg-green"
                  }`}
                >
                  {deny ? <IconCross size={11} strokeWidth={3} /> : <IconCheck size={12} strokeWidth={3} />}
                </span>
                <span className="text-ui font-medium text-ink">{copy.label}</span>
                <span className="ml-auto text-label text-ink-3">{copy.hint}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-pressed={all}
          className="-mx-2 mt-1 flex min-h-10 w-[calc(100%+16px)] items-center gap-2.5 rounded-control px-2 py-1.5
            text-left transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.99]"
        >
          <span
            className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-100 ${
              all ? "border-transparent bg-ink text-page" : "border-line-strong text-transparent"
            }`}
          >
            <IconCheck size={10} strokeWidth={3} />
          </span>
          <span className="text-label text-ink-2">
            Apply to every approval waiting on this turn
          </span>
        </button>
      </div>
    </div>
  );
}
