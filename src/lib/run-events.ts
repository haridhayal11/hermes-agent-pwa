/* Upstream run events, normalised at the edge before they are persisted.
 *
 * Every consumer of our event log — useThread, run-text, activity, the v1
 * SSE stream that Android switches on — was written against the 0.20.5
 * vocabulary. Newer gateways say some of the same things differently, so
 * the translation happens once, here, rather than in every reader:
 *
 *   - `run.interrupted` is a gateway shutdown mid-run. To everyone downstream
 *     that is a failed run with a reason, so it becomes `run.failed`.
 *   - `approval.settled` is how a gateway under session authority says an
 *     approval is no longer pending (answered, or retired with its
 *     generation). It is `approval.responded` to every reader we have.
 *
 * `clarify.request` / `clarify.settled`, `message.interim` and `run.queued`
 * are genuinely new and pass through unchanged. Pure, so it is testable. */

export function normalizeUpstreamEvent(event: Record<string, unknown>): Record<string, unknown> {
  switch (event.event) {
    case "run.interrupted":
      return {
        ...event,
        event: "run.failed",
        error:
          typeof event.error === "string" && event.error
            ? event.error
            : "Gateway shutdown interrupted the run.",
        interrupted: true,
      };
    case "approval.settled":
      return { ...event, event: "approval.responded", resolved: true };
    default:
      return event;
  }
}

/** A prompt the gateway is blocked on, as its request event names it. Only a
 *  gateway under session authority sends the id and generation, and only then
 *  does it require them back. */
export interface PromptRef {
  requestId: string;
  generation: number;
}

export function promptRef(event: Record<string, unknown>): PromptRef | null {
  const requestId = event.prompt_id ?? event.request_id;
  const generation = event.execution_generation;
  if (typeof requestId !== "string" || !requestId) return null;
  if (typeof generation !== "number" || !Number.isInteger(generation)) return null;
  return { requestId, generation };
}

/** The request body `/approval` and `/clarify` accept. Under session
 *  authority the key set must be exactly `{request_id, execution_generation,
 *  <field>}` — an extra `all` is `invalid_params` — so the legacy body is
 *  used only when the request carried no reference. */
export function promptResponseBody(
  ref: PromptRef | null,
  field: "choice" | "answer",
  value: string,
  legacy: Record<string, unknown> = {},
): Record<string, unknown> {
  if (ref) {
    return { request_id: ref.requestId, execution_generation: ref.generation, [field]: value };
  }
  return { [field]: value, ...legacy };
}
