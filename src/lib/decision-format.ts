import { RECOMMEND_FENCE } from "./chat-types";

/* How the agent asks for a decision in a shape the app can act on: a
 * ```hermes-recommend fence the thread renders as a card with buttons, and
 * that the notifications panel can answer in place. Two audiences, one
 * contract — so one module, importable on either side. */

const EXAMPLE =
  `\`\`\`${RECOMMEND_FENCE}` +
  '\n{"kind": "recommendation", "title": "Short recommendation", "rationale": "One or two sentences of why", "confidence": 0.8, "actions": [{"label": "Do it", "reply": "yes, go ahead"}, {"label": "Not now", "reply": "skip that for now"}]}\n```';

/** Re-sent in every project run's instructions, so its length is a standing
 *  cost per turn. One example covers both kinds deliberately. */
export const DECISION_FORMAT = [
  `When you are recommending a course of action, or need the user to choose between options before you can continue, end your reply with a fenced block tagged \`${RECOMMEND_FENCE}\` containing JSON:`,
  EXAMPLE,
  "The app renders it as a card with one button per action; pressing a button sends that action's `reply` back as the user's next message, and they can always type something else instead. Use `\"kind\": \"question\"` and omit `confidence` when you are asking rather than advising. `confidence` is 0 to 1 and should be your honest estimate. Use at most four actions, and use this only when there is a real choice to make — not on every turn.",
].join("\n\n");

/**
 * The same contract for a scheduled job's prompt. A job runs in its own
 * session without any project's instructions, so a brief only knows the
 * format if its prompt says so — and a decision buried in prose is one the
 * notifications panel can't offer to answer.
 */
export const JOB_DECISION_FORMAT = [
  `If this report needs a decision from me, end it with a fenced block tagged \`${RECOMMEND_FENCE}\` containing JSON, one action per option:`,
  `\`\`\`${RECOMMEND_FENCE}` +
    '\n{"kind": "question", "title": "The decision, as a short question", "actions": [{"label": "Option A", "reply": "go with option A"}, {"label": "Option B", "reply": "go with option B"}]}\n```',
  "Use at most four actions, and leave the block out when nothing needs deciding.",
].join("\n\n");
