"use client";

import type { Recommendation } from "@/lib/chat-types";
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

export function parseRecommendation(raw: string): Recommendation | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  if (!title) return null;

  const actions = Array.isArray(obj.actions)
    ? obj.actions.flatMap((item): Recommendation["actions"] => {
        if (!item || typeof item !== "object") return [];
        const a = item as Record<string, unknown>;
        const label = typeof a.label === "string" ? a.label.trim() : "";
        // `reply` is what gets sent back on press. Falling back to the label
        // keeps a card usable when the agent only wrote one of the two.
        const reply = typeof a.reply === "string" && a.reply.trim() ? a.reply.trim() : label;
        return label ? [{ label, reply }] : [];
      })
    : [];

  const confidence = typeof obj.confidence === "number" ? obj.confidence : undefined;
  // Declared wins; inference is the fallback for a reply written against the
  // older contract, where the fence only ever meant "recommendation".
  const kind =
    obj.kind === "question" || obj.kind === "recommendation"
      ? obj.kind
      : confidence === undefined
        ? "question"
        : "recommendation";

  return {
    kind,
    title,
    rationale: typeof obj.rationale === "string" ? obj.rationale.trim() : undefined,
    confidence,
    actions: actions.slice(0, 4),
  };
}

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
      <div className="primitive-card-pad">
        <div className="flex items-start gap-2">
          {/* A question shares the approval card's orange: both are the run
            * stopping to wait on you, and they should read as one family. */}
          <span
            className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-full ${
              asking ? "bg-orange-tint text-orange" : "bg-accent-tint text-accent"
            }`}
          >
            {asking ? <IconQuestion size={12} /> : <IconBulb size={12} />}
          </span>
          <span className="text-ui font-medium text-ink [overflow-wrap:anywhere]">
            {title}
          </span>
        </div>

        {rationale && (
          <p className="mt-1.5 text-ui leading-[1.5] whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">
            {rationale}
          </p>
        )}

        {typeof confidence === "number" && (
          <div className="mt-2.5">
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
          <div className="mt-2.5 flex flex-col gap-1.5">
            {actions.map((action, i) =>
              onAction ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => onAction(action.reply)}
                  className={`tap-target flex h-9 w-full items-center justify-center rounded-control px-3
                    text-label font-medium shadow-btn transition-transform duration-100 active:scale-[0.98] ${
                      i === 0
                        ? "bg-ink text-page"
                        : "bg-field text-ink hover:bg-hover"
                    }`}
                >
                  <span className="truncate">{action.label}</span>
                </button>
              ) : (
                <span
                  key={i}
                  className="flex h-9 w-full items-center justify-center rounded-control bg-field px-3 text-label text-ink-3"
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
          <p className="mt-1.5 text-meta text-ink-3">or type your own answer</p>
        )}
      </div>
    </div>
  );
}
