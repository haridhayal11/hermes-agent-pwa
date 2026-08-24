/**
 * `cron` is ours, not Hermes'. A scheduled job's result is not a turn in the
 * session — it never went through the model in *this* conversation — so it
 * gets its own role and its own card rather than being dressed up as an
 * assistant reply the thread could be asked to continue.
 */
export type MessageRole = "user" | "assistant" | "system" | "cron";

/**
 * What the user hung off a message. Images ride inline as data: URLs because
 * that is the only non-http image form Hermes accepts; everything else is
 * written to the host's disk and referenced by absolute path, because Hermes
 * rejects document attachments and has no upload endpoint.
 */
export type Attachment =
  | {
      kind: "image";
      name: string;
      /** data: URL — the only inline image form Hermes accepts */
      url: string;
      /** where the same bytes were also written, so the thumbnail survives */
      path?: string;
      size?: number;
    }
  | { kind: "file"; name: string; path: string; size?: number };

/** What a `cron` message carries beyond its text. */
export interface CronMeta {
  jobId: string;
  jobName: string;
  status: "ok" | "failed";
  ts: number;
}

export interface ThreadMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** present exactly when role is "cron" */
  cron?: CronMeta;
  /**
   * Local to the live turn. History is re-read from Hermes, which returns the
   * text only — but every attachment's path is also named in the prompt text,
   * so FileLinks re-discovers them on reload and the turn looks the same.
   */
  attachments?: Attachment[];
}

export type ToolStatus = "running" | "completed" | "failed";

export interface ToolCall {
  id: string;
  name: string;
  /** short one-line summary Hermes sends alongside the call */
  preview?: string;
  status: ToolStatus;
  /**
   * Detail lines. Hermes 0.20.5 sends no per-tool progress on /v1/runs — the
   * `_thinking` marker and `hermes.tool.progress` are deliberately withheld
   * from the run stream (api_server.py `_make_run_event_callback`). So this
   * is populated from `preview` only, and stays a string[] because older
   * builds do stream fragments into it.
   */
  detail: string[];
}

/**
 * A delegate_task child, assembled from subagent.start / subagent.complete.
 * Every field past `id` is optional because Hermes only forwards the keys it
 * actually has for that run.
 */
export interface SubagentRun {
  id: string;
  goal?: string;
  status: "running" | "completed" | "failed";
  summary?: string;
  model?: string;
  depth?: number;
  taskIndex?: number;
  taskCount?: number;
  durationSeconds?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  filesRead?: number;
  filesWritten?: number;
}

/**
 * `stopping` is a real upstream state: POST /v1/runs/{id}/stop emits
 * run.stopping and the run keeps streaming until it settles as cancelled.
 */
export type RunPhase =
  | "idle"
  | "running"
  | "waiting_for_approval"
  | "stopping";

/**
 * The full approval.request payload. Hermes sends description/pattern_key
 * alongside the command (tools/approval.py builds approval_data), and the
 * allow_* flags decide which choices are legal — `choices` already reflects
 * them, but keeping the flags lets the card explain *why* one is missing.
 */
export interface PendingApproval {
  runId: string;
  command: string | null;
  description: string | null;
  patternKey: string | null;
  choices: string[];
  allowPermanent: boolean;
  allowSession: boolean;
  /** owner override of a Smart DENY — only `once` and `deny` are offered */
  smartDenied: boolean;
}

/**
 * The fence language the agent is told to use for a recommendation.
 *
 * Shared because three places have to agree on it: `composeInstructions()`
 * teaches it, `MessageBody` parses it, and `replyPreview()` skips it.
 */
export const RECOMMEND_FENCE = "hermes-recommend";

/** One agent action offered by a ```hermes-recommend fence. */
export interface RecommendationAction {
  label: string;
  /** text sent back to the agent when the button is pressed */
  reply: string;
}

export interface Recommendation {
  /**
   * A suggestion the agent is making, or a choice it needs from you before it
   * can continue. Same shape, same fence — a question is a recommendation with
   * no opinion attached.
   *
   * Declared rather than inferred from `confidence`: a model that simply
   * forgot to write a confidence would otherwise have its recommendation
   * silently re-rendered as a question. `parseRecommendation` still infers
   * when the field is absent, for replies written against the older contract.
   */
  kind: "recommendation" | "question";
  title: string;
  rationale?: string;
  /** 0..1; anything outside that range is clamped. Absent on questions. */
  confidence?: number;
  actions: RecommendationAction[];
}

export interface Project {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  cwd: string | null;
  /** Persistent framing, re-sent as `instructions` on every run. */
  instructions: string | null;
  pinned: number;
  /** JSON array of Hermes skill names — parse with parseSkills(). */
  skills: string | null;
  /**
   * Per-run model override, passed straight to POST /v1/runs. NULL means "use
   * the gateway default". Deliberately not Hermes' session model *lock*
   * (POST /api/sessions/{id}/model): a lock plus a per-run model is what
   * _request_route_conflict_error rejects, and this keeps the choice ours.
   */
  model: string | null;
  provider: string | null;
  /** JSON of Hermes model_options: {reasoning:{enabled,effort}, fast} */
  model_options: string | null;
  session_id: string;
  created_at: number;
  last_active_at: number;
  archived: number;
}
