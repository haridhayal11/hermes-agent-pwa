"use client";

import type { Recommendation } from "@/lib/chat-types";

export { parseRecommendation } from "@/lib/recommendation";
import { Meter } from "@/components/ui/Meter";
import { IconBulb, IconQuestion } from "@/components/primitives/icons";

/* Agent suggestion with a confidence meter and actions — and the same card
 * without the confidence, which is a question.
 *
 * Hermes has no primitive for either. Nothing on the wire carries a
 * suggestion, a confidence, or a clarifying question; an approval is the only
 * human-in-the-loop event it emits, and that one is a security gate, not a
 * conversation. So this is driven by the agent itself: the project
 * instructions teach it to emit a ```hermes-recommend fence, and splitFences()
 * in Message.tsx already tokenises fences with their language tag, so
 * recognising one costs a branch rather than a parser.
 *
 * The consequence of convention over protocol: a model that ignores the
 * contract just writes prose, and there is no way to make it not. A malformed
 * fence is not an error worth surfacing either — parseRecommendation returns
 * null and the caller falls back to an ordinary code block, which is exactly
 * what the text is at that point. */

export function RecommendationCard({
  recommendation,
  onAction,
}: {
  recommendation: Recommendation;
  /**
   * Absent on every turn but the newest. An old recommendation's buttons
   * would send their reply into a conversation that has long since moved
   * past the question, so they render as inert labels instead.
   */
  onAction?: (reply: string) => void;
}) {
  const { kind, title, rationale, confidence, actions } = recommendation;
  const asking = kind === "question";

  return (
    <div
      className="w-full overflow-hidden rounded-card bg-surface shadow-card"
      style={{ animation: "pop-in var(--duration-fast) var(--ease-out-strong) both" }}
    >
      <div className="p-4">
        <div className="flex items-start gap-2.5">
          {/* A question shares the approval card's orange: both are the run
            * stopping to wait on you, and they should read as one family. */}
          <span
            className={`mt-px flex size-6 shrink-0 items-center justify-center rounded-full ${
              asking ? "bg-orange-tint text-orange" : "bg-accent-tint text-accent"
            }`}
          >
            {asking ? <IconQuestion size={14} /> : <IconBulb size={14} />}
          </span>
          <span className="pt-0.5 text-ui font-semibold text-balance text-ink [overflow-wrap:anywhere]">
            {title}
          </span>
        </div>

        {rationale && (
          <p className="mt-2 text-ui leading-[1.55] whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">
            {rationale}
          </p>
        )}

        {typeof confidence === "number" && (
          <div className="mt-3">
            <Meter
              value={confidence}
              label="Confidence"
              caption={`${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`}
            />
          </div>
        )}

        {/* One per line. Wrapping chips gave a ragged 2-then-1 grid on a
          * 390px screen and made the third option read as an afterthought —
          * these are alternatives of equal standing, and one of them is
          * usually destructive. A full-width row is also the easiest thing
          * to hit with a thumb. */}
        {actions.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {actions.map((action, i) =>
              onAction ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => onAction(action.reply)}
                  className={`flex h-10 w-full items-center justify-center rounded-full px-4
                    text-ui font-medium transition-[background-color,transform] duration-150 active:scale-[0.98] ${
                      i === 0
                        ? "bg-ink text-page"
                        : "text-ink shadow-btn hover:bg-hover"
                    }`}
                >
                  <span className="truncate">{action.label}</span>
                </button>
              ) : (
                <span
                  key={i}
                  className="flex h-10 w-full items-center justify-center rounded-full px-4 text-ui text-ink-3 shadow-hairline"
                >
                  <span className="truncate">{action.label}</span>
                </span>
              ),
            )}
          </div>
        )}

        {/* Buttons are shortcuts, not the whole answer set — say so, or three
          * options read as the only three. Only worth saying while they work. */}
        {asking && onAction && actions.length > 0 && (
          <p className="mt-2.5 text-center text-label text-ink-3">or type your own answer</p>
        )}
      </div>
    </div>
  );
}
