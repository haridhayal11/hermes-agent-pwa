"use client";

import { useState } from "react";
import { useAgentName } from "@/components/AgentNameContext";
import type { PendingClarify } from "@/lib/chat-types";
import { IconCheck } from "@/components/primitives/icons";

/* A question the agent's clarify tool asked mid-run (`clarify.request`,
 * answered at `POST /v1/runs/{id}/clarify`). It sits where ApprovalCard
 * sits and shares its frame, because it blocks the run the same way.
 *
 * The choices are shortcuts, not the only answers: the gateway accepts any
 * string, and whatever is typed into the composer while this is up answers
 * it too (useThread.send). A multi-select answers with the JSON array of the
 * picked labels, which is how tools/clarify_tool.py parses it. The gateway
 * decorates its recommended choice in the label and strips that itself, so
 * labels are sent back exactly as they arrived. */

export function ClarifyCard({
  clarify,
  onAnswer,
}: {
  clarify: PendingClarify;
  onAnswer: (answer: string) => void;
}) {
  const agentName = useAgentName();
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (choice: string) =>
    setPicked((prev) =>
      prev.includes(choice) ? prev.filter((c) => c !== choice) : [...prev, choice],
    );

  return (
    <div
      className="w-full overflow-hidden rounded-card bg-surface shadow-card"
      style={{ animation: "pop-in var(--duration-fast) var(--ease-out-strong) both" }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="text-ui font-semibold text-balance text-ink">
            {agentName} has a question
          </span>
          <span className="shrink-0 rounded-full bg-orange-tint px-2 py-0.5 text-meta font-medium text-orange">
            Waiting
          </span>
        </div>

        {clarify.question && (
          <p className="mt-2 text-ui leading-[1.55] whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">
            {clarify.question}
          </p>
        )}

        {clarify.choices.length > 0 && (
          <div className="mt-3 flex flex-col gap-0.5">
            {clarify.choices.map((choice) => {
              const on = picked.includes(choice);
              return (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={clarify.multiSelect ? on : undefined}
                  onClick={() => (clarify.multiSelect ? toggle(choice) : onAnswer(choice))}
                  className="-mx-2 flex min-h-10 w-[calc(100%+16px)] items-center gap-2.5 rounded-control px-2 py-1.5
                    text-left transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.99]"
                >
                  {clarify.multiSelect && (
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-100 ${
                        on ? "border-transparent bg-ink text-page" : "border-line-strong text-transparent"
                      }`}
                    >
                      <IconCheck size={10} strokeWidth={3} />
                    </span>
                  )}
                  <span className="text-ui font-medium text-ink [overflow-wrap:anywhere]">{choice}</span>
                </button>
              );
            })}
          </div>
        )}

        {clarify.multiSelect && (
          <button
            type="button"
            disabled={picked.length === 0}
            onClick={() => onAnswer(JSON.stringify(picked))}
            className="mt-2 h-9 rounded-full bg-ink px-4 text-label font-medium text-page
              transition-[opacity,transform] duration-150 active:scale-[0.97] disabled:opacity-40"
          >
            Answer
          </button>
        )}

        <p className="mt-2.5 text-label text-ink-3">
          {clarify.choices.length > 0 ? "Or type an answer below." : "Type your answer below."}
        </p>
      </div>
    </div>
  );
}
