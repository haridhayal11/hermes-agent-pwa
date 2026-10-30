import { RECOMMEND_FENCE, type Recommendation } from "./chat-types";

/* The ```hermes-recommend contract, parsed. Pure and React-free: the thread
 * renders it, but the server reads it too — activity builds notifications
 * from open questions, run-manager and the cron watcher decide whether a push
 * is a question — and a "use client" module can't be called from there. */

export type Segment =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string; language?: string };

/** Splits ``` fences out of assistant text. Everything else stays literal —
 * no markdown renderer, so agent output can't inject markup. */
export function splitFences(content: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```([\w+-]*)\n?([\s\S]*?)(?:```|$)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(content)) !== null) {
    if (match.index > cursor) {
      segments.push({ kind: "text", value: content.slice(cursor, match.index) });
    }
    segments.push({ kind: "code", value: match[2], language: match[1] || undefined });
    cursor = fence.lastIndex;
  }
  if (cursor < content.length) {
    segments.push({ kind: "text", value: content.slice(cursor) });
  }
  return segments.filter((s) => s.kind === "code" || s.value.trim().length > 0);
}

/**
 * Which segment carries the answerable question, or -1.
 *
 * A `kind: "question"` card is the run handing the decision back — the same
 * thing an approval is, minus the security gate — so the thread hoists it out
 * of the transcript and pins it above the composer. A `kind: "recommendation"`
 * card is commentary and stays where it was written. The *last* question wins:
 * an agent that asks twice in a turn is asking about the second thing, and the
 * earlier card stays inline as the record of a question already overtaken.
 */
export function questionAt(segments: Segment[]): number {
  let index = -1;
  segments.forEach((segment, i) => {
    if (segment.kind !== "code" || segment.language !== RECOMMEND_FENCE) return;
    const parsed = parseRecommendation(segment.value);
    if (parsed && parsed.kind === "question" && parsed.actions.length > 0) index = i;
  });
  return index;
}

/** The question a turn ends on, for the thread's pinned decision slot. */
export function extractQuestion(content: string): Recommendation | null {
  const segments = splitFences(content);
  const at = questionAt(segments);
  if (at === -1) return null;
  const segment = segments[at];
  return segment.kind === "code" ? parseRecommendation(segment.value) : null;
}

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
