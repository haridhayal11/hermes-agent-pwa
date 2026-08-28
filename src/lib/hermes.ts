// Typed client for the Hermes agent's api_server.py (:8642). The browser never
// sees HERMES_API_KEY — every call here runs in a Next.js route handler.

const BASE_URL = process.env.HERMES_API_URL || "http://127.0.0.1:8642";
const API_KEY = process.env.HERMES_API_KEY || "";

export class HermesApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Hermes API ${status}: ${JSON.stringify(body)}`);
  }
}

async function hermesFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new HermesApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Raw streaming fetch to /v1/runs/{id}/events — caller owns the response body. */
export async function hermesFetchStream(path: string): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new HermesApiError(res.status, body);
  }
  return res;
}

// NOTE: api_server.py's _session_response() safe-keys list does NOT include
// cwd/git_repo_root — /api/sessions has no concept of a working directory.
// "Project cwd" in this app is our own metadata only; Hermes never sees it.
export interface HermesSession {
  id: string;
  source?: string;
  title?: string;
  started_at?: string | number;
  ended_at?: string | number | null;
  end_reason?: string | null;
  message_count?: number;
  model?: string;
  parent_session_id?: string | null;
  last_active?: string | number;
  preview?: string;
  [key: string]: unknown;
}

export interface HermesMessage {
  // Hermes releases in the wild have emitted both JSON strings and numbers.
  // Native API responses canonicalise this to a string at our boundary.
  id?: string | number;
  session_id?: string;
  role: string;
  content?: string;
  tool_call_id?: string;
  tool_calls?: unknown;
  tool_name?: string;
  timestamp?: string | number;
  [key: string]: unknown;
}

export interface HermesSkill {
  name: string;
  description?: string;
  category?: string;
  [key: string]: unknown;
}

export interface ConversationHistoryEntry {
  role: string;
  content: string;
}

/**
 * OpenAI-shaped content parts. api_server.py normalises these and accepts
 * `image_url` entries whose url is http(s) or `data:image/...`; every other
 * part type is answered with 400 unsupported_content_type.
 */
export type HermesContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * GET /api/model/options — Hermes' own provider inventory, the same one the
 * dashboard/TUI model picker reads. Richer than /v1/models, which only lists
 * the virtual `hermes-agent` alias plus configured model_routes.
 */
export interface HermesModelProvider {
  slug: string;
  name: string;
  models: string[];
  total_models?: number;
  is_current?: boolean;
  authenticated?: boolean;
  auth_type?: string;
  warning?: string;
  /** per-model feature flags, keyed by model id */
  capabilities?: Record<string, { fast?: boolean; reasoning?: boolean }>;
  featured_models?: string[];
  [key: string]: unknown;
}

export interface HermesToolset {
  name: string;
  label?: string;
  description?: string;
  enabled?: boolean;
  configured?: boolean;
  tools?: string[];
}

/**
 * A Hermes cron job, as `/api/jobs` returns it (verified against 0.20.5 on
 * home-laptop). Note the asymmetry: `schedule` is a **string** on write —
 * "every 30m", "0 9 * * *", "2026-02-03T14:00", bare "2h" — and a structured
 * object on read. `parse_schedule` owns that translation and the app never
 * duplicates it.
 */
export interface HermesJobSchedule {
  kind: "once" | "interval" | "cron";
  display?: string;
  /** kind=once */
  run_at?: string;
  /** kind=interval */
  minutes?: number;
  /** kind=cron */
  expr?: string;
}

export interface HermesJob {
  id: string;
  name: string;
  prompt: string;
  skills: string[] | null;
  /** legacy single-skill field; Hermes keeps it as skills[0] */
  skill: string | null;
  schedule: HermesJobSchedule;
  schedule_display: string;
  /** `times: null` means forever */
  repeat: { times: number | null; completed: number };
  enabled: boolean;
  state: string;
  created_at: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_delivery_error: string | null;
  /** "local" | "origin" | "telegram" | "telegram:<chat>:<thread>" | … */
  deliver: string;
  paused_at?: string | null;
  paused_reason?: string | null;
  /** 0.20.5 and later; finer-grained than last_run_at */
  latest_execution?: {
    status?: string;
    finished_at?: string | null;
    started_at?: string | null;
    error?: string | null;
  } | null;
  [key: string]: unknown;
}

export interface CreateJobParams {
  name: string;
  /** Hermes' own grammar; validated server-side by parse_schedule */
  schedule: string;
  prompt?: string;
  deliver?: string;
  skills?: string[];
  /** positive integer, or omitted for "forever" */
  repeat?: number;
}

/**
 * The subset PATCH accepts. api_server.py filters the body against
 * `_UPDATE_ALLOWED_FIELDS` and answers 400 when nothing survives, so sending
 * anything else is silently ignored rather than rejected.
 *
 * `repeat` is deliberately **not** here even though the whitelist admits it.
 * A job stores it as `{times, completed}`, `update_job` merges updates with a
 * plain `{**job, **updates}`, and the handler forwards the body verbatim — so
 * `repeat: 3` would replace the dict with an integer and every later
 * `repeat.get("times")` in the scheduler would raise. Run limits are
 * create-only over this API.
 */
export interface UpdateJobParams {
  name?: string;
  schedule?: string;
  prompt?: string;
  deliver?: string;
  skills?: string[];
  skill?: string;
  enabled?: boolean;
}

export interface StartRunOptions {
  sessionId: string;
  input: string | HermesContentPart[];
  conversationHistory?: ConversationHistoryEntry[];
  /**
   * Ephemeral system prompt, re-sent on every run. This is how a project's
   * persistent framing survives — unlike a seed message it never scrolls out
   * of the transcript and is never lost to context compaction.
   */
  instructions?: string;
  /**
   * X-Hermes-Session-Key — a stable per-channel identifier that scopes
   * long-term memory across transcripts, independent of session id
   * (api_server.py:994). Inert under the built-in profile-scoped memory
   * provider, but makes per-project memory work under Honcho et al.
   */
  sessionKey?: string;
  model?: string;
  provider?: string;
  modelOptions?: Record<string, unknown>;
}

export interface StartRunResult {
  run_id: string;
  [key: string]: unknown;
}

export const hermes = {
  listSessions(params?: {
    limit?: number;
    offset?: number;
    source?: string;
    includeChildren?: boolean;
  }) {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.source) q.set("source", params.source);
    if (params?.includeChildren != null)
      q.set("include_children", String(params.includeChildren));
    const qs = q.toString();
    return hermesFetch<{
      object: "list";
      data: HermesSession[];
      limit: number;
      offset: number;
      has_more: boolean;
    }>(`/api/sessions${qs ? `?${qs}` : ""}`);
  },

  async createSession(params: { id: string; title?: string }) {
    const res = await hermesFetch<{ object: "hermes.session"; session: HermesSession }>(
      "/api/sessions",
      { method: "POST", body: JSON.stringify(params) },
    );
    return res.session;
  },

  async getSession(id: string) {
    const res = await hermesFetch<{ object: "hermes.session"; session: HermesSession }>(
      `/api/sessions/${id}`,
    );
    return res.session;
  },

  async patchSession(id: string, params: { title?: string; end_reason?: string }) {
    const res = await hermesFetch<{ object: "hermes.session"; session: HermesSession }>(
      `/api/sessions/${id}`,
      { method: "PATCH", body: JSON.stringify(params) },
    );
    return res.session;
  },

  deleteSession(id: string) {
    return hermesFetch<void>(`/api/sessions/${id}`, { method: "DELETE" });
  },

  getMessages(id: string) {
    return hermesFetch<{
      object: "list";
      session_id: string;
      data: HermesMessage[];
    }>(`/api/sessions/${id}/messages`);
  },

  async forkSession(id: string, params?: { id?: string; title?: string }) {
    const res = await hermesFetch<{ object: "hermes.session"; session: HermesSession }>(
      `/api/sessions/${id}/fork`,
      { method: "POST", body: JSON.stringify(params || {}) },
    );
    return res.session;
  },

  startRun(opts: StartRunOptions) {
    // api_server.py's array branch treats `input` as a list of *messages*
    // (`{role, content}`), not a bare list of content parts — an array of
    // `{type: "image_url", ...}` gets read as one empty message per part
    // (no `content` key on a part) and 400s "No user message found in
    // input". A single-part-array input has to be wrapped as one message.
    const input = Array.isArray(opts.input)
      ? [{ role: "user", content: opts.input }]
      : opts.input;
    return hermesFetch<StartRunResult>("/v1/runs", {
      method: "POST",
      headers: opts.sessionKey
        ? { "X-Hermes-Session-Key": opts.sessionKey }
        : undefined,
      body: JSON.stringify({
        session_id: opts.sessionId,
        input,
        conversation_history: opts.conversationHistory,
        instructions: opts.instructions,
        model: opts.model,
        provider: opts.provider,
        model_options: opts.modelOptions,
      }),
    });
  },

  /** GET /v1/runs/{id}/events — single-consumer SSE stream, destroyed on disconnect. */
  streamRunEvents(runId: string) {
    return hermesFetchStream(`/v1/runs/${runId}/events`);
  },

  getRun(runId: string) {
    return hermesFetch<{ status: string; [key: string]: unknown }>(
      `/v1/runs/${runId}`,
    );
  },

  stopRun(runId: string) {
    return hermesFetch<void>(`/v1/runs/${runId}/stop`, { method: "POST" });
  },

  /**
   * POST /v1/runs/{id}/steer — inject guidance into a run already in flight.
   * Text only; there is no attachment form.
   *
   * 409 `run_not_accepting_steer` whenever the run's status is not exactly
   * "running" — which includes waiting_for_approval and the window after
   * /stop. Callers must treat 409 as "queue it instead", not as an error.
   */
  steerRun(runId: string, text: string) {
    return hermesFetch<{ object: string; run_id: string; accepted: boolean }>(
      `/v1/runs/${runId}/steer`,
      { method: "POST", body: JSON.stringify({ input: text }) },
    );
  },

  approveRun(
    runId: string,
    choice: "once" | "session" | "always" | "deny",
    all?: boolean,
  ) {
    return hermesFetch<void>(`/v1/runs/${runId}/approval`, {
      method: "POST",
      body: JSON.stringify({ choice, all }),
    });
  },

  health() {
    return hermesFetch<{ status: string }>("/health");
  },

  capabilities() {
    return hermesFetch<Record<string, unknown>>("/v1/capabilities");
  },

  /** GET /v1/skills — metadata only; there is no endpoint for a skill's body. */
  skills() {
    return hermesFetch<{ object: "list"; data: HermesSkill[] }>("/v1/skills");
  },

  toolsets() {
    return hermesFetch<{ object: "list"; data: HermesToolset[] }>("/v1/toolsets");
  },

  /**
   * GET /api/model/options. Slow — it enriches with provider catalogues and
   * pricing — so /api/models memoises the result rather than calling this on
   * every picker open.
   */
  modelOptions(refresh = false) {
    return hermesFetch<{ providers: HermesModelProvider[]; [k: string]: unknown }>(
      `/api/model/options${refresh ? "?refresh=1" : ""}`,
    );
  },

  /**
   * Cron jobs. These live at `/api/jobs`, not `/v1/*`, and answer a plain
   * `{"error": "..."}` rather than the OpenAI-shaped envelope — hermesFetch
   * carries both through HermesApiError.body unchanged.
   *
   * Two upstream quirks the callers have to know about:
   *   - `include_disabled` is not optional in practice. Pausing a job sets
   *     `enabled: false`, and the default list filters those out, so a paused
   *     job looks deleted unless it is asked for.
   *   - `/v1/capabilities` reports `jobs_admin: false` as a hardcoded literal
   *     while this whole surface is live, and its `endpoints` map omits
   *     /api/jobs entirely. A real GET is the only honest feature probe; 501
   *     means the gateway has no cron module.
   */
  jobs: {
    list(params?: { includeDisabled?: boolean }) {
      const qs = params?.includeDisabled ? "?include_disabled=true" : "";
      return hermesFetch<{ jobs: HermesJob[] }>(`/api/jobs${qs}`);
    },

    get(jobId: string) {
      return hermesFetch<{ job: HermesJob }>(`/api/jobs/${jobId}`);
    },

    create(params: CreateJobParams) {
      return hermesFetch<{ job: HermesJob }>("/api/jobs", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },

    update(jobId: string, params: UpdateJobParams) {
      return hermesFetch<{ job: HermesJob }>(`/api/jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify(params),
      });
    },

    remove(jobId: string) {
      // Also rmtree's ~/.hermes/cron/output/<job_id>/ upstream — our own
      // cron_deliveries rows are what survives it.
      return hermesFetch<{ ok: boolean }>(`/api/jobs/${jobId}`, {
        method: "DELETE",
      });
    },

    pause(jobId: string) {
      return hermesFetch<{ job: HermesJob }>(`/api/jobs/${jobId}/pause`, {
        method: "POST",
      });
    },

    resume(jobId: string) {
      return hermesFetch<{ job: HermesJob }>(`/api/jobs/${jobId}/resume`, {
        method: "POST",
      });
    },

    /**
     * Sets next_run_at to now. It fires on the scheduler's next tick, not
     * synchronously — there is no run id and nothing to await, so the UI says
     * "queued" and the watcher picks the result up like any other fire.
     */
    runNow(jobId: string) {
      return hermesFetch<{ job: HermesJob }>(`/api/jobs/${jobId}/run`, {
        method: "POST",
      });
    },
  },
};
