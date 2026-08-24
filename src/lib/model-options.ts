/* Hermes `model_options`, as api_server reads them.
 *
 * `_request_reasoning_config` turns `reasoning` into the agent's
 * reasoning_config, and `_request_service_tier` turns `fast` into
 * service_tier "priority". Both are per-request on POST /v1/runs, which is
 * why they live on the project row rather than on the Hermes session.
 *
 * Shared by the model picker and the composer's thinking chip, so neither has
 * to import a helper out of the other's component module.
 */

export interface ModelOptions {
  /** api_server maps this to AIAgent reasoning_config */
  reasoning?: { enabled: boolean; effort?: string };
  /** maps to service_tier "priority" */
  fast?: boolean;
}

/** null model = clear the override and fall back to the gateway default. */
export interface ModelSelection {
  model: string | null;
  provider: string | null;
  modelOptions: ModelOptions;
}

/**
 * api_server accepts none|minimal|low|medium|high|xhigh|max|ultra and clamps
 * to each provider's own vocabulary downstream. Three rungs plus off is what
 * fits a phone; the ladder's extremes are a CLI concern.
 */
export const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** The chosen effort, or null when reasoning is off or unset. */
export function effortOf(options: ModelOptions): string | null {
  const reasoning = options.reasoning;
  if (!reasoning || reasoning.enabled === false) return null;
  return reasoning.effort ?? null;
}

/** `null` turns reasoning off; anything else sets the effort. */
export function withEffort(
  options: ModelOptions,
  effort: ReasoningEffort | null,
): ModelOptions {
  return {
    ...options,
    reasoning: effort === null ? { enabled: false } : { enabled: true, effort },
  };
}

/** Short enough for a chip on a 390px phone. */
export function effortLabel(effort: string | null): string {
  if (effort === null) return "off";
  return effort === "medium" ? "med" : effort;
}
