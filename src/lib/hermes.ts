// Typed client for the Hermes agent's api_server.py (:8642). The browser never
// sees HERMES_API_KEY — every call here runs in a Next.js route handler.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promptResponseBody, type PromptRef } from "./run-events";

const BASE_URL = process.env.HERMES_API_URL || "http://127.0.0.1:8642";
const API_KEY = process.env.HERMES_API_KEY || "";

/** The gateway's own home. Named profiles live under `<home>/profiles/<id>/`. */
export const HERMES_HOME =
  process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");

export class HermesApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Hermes API ${status}: ${JSON.stringify(body)}`);
  }
}

/* ── Profiles (Bot Mode) ──────────────────────────────────────────────────
 *
 * A Hermes "Bot" is a profile, and one gateway serves every profile on the
 * host: `/p/<profile>/v1/...` mirrors each route under that profile's config,
 * memory, skills and session DB (`gateway.multiplex_profiles`, on by default
 * and no longer optional). The catch is the key. A prefixed request must carry
 * the *profile's* API_SERVER_KEY — the default listener's key is rejected, and
 * a profile without one of its own fails closed with 401.
 *
 * So a profile's key is resolved here and nowhere else, the same as the main
 * one: `HERMES_PROFILE_<NAME>_KEY` from our environment if set (the shape of
 * upstream's `HERMES_PEER_<NAME>_KEY`), else `API_SERVER_KEY` from the
 * profile's own `.env` — which is where Hermes reads it, and this app runs on
 * the same host as the gateway by design. */

const PROFILE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * The canonical profile id, or null for the default profile. Ids are
 * lowercase on disk and upstream normalises `/p/Coder/` to `coder`, so a
 * mixed-case label must name the same profile here too. Throws on anything
 * that could not be a profile directory — it ends up in a URL path.
 */
export function normalizeProfile(profile: string | null | undefined): string | null {
  const id = (profile ?? "").trim().toLowerCase();
  if (!id || id === "default") return null;
  if (!PROFILE_ID_RE.test(id)) throw new Error(`Invalid Hermes profile id: ${profile}`);
  return id;
}

export function profileDir(profile: string | null): string {
  return profile ? path.join(HERMES_HOME, "profiles", profile) : HERMES_HOME;
}

function profileKeyEnvName(profile: string): string {
  return `HERMES_PROFILE_${profile.toUpperCase().replace(/-/g, "_")}_KEY`;
}

/** One value out of a dotenv file, with python-dotenv's quoting and comments. */
export function readDotenvValue(text: string, name: string): string | null {
  let found: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0 || line.slice(0, eq).trim() !== name) continue;
    let value = line.slice(eq + 1).trim();
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      const end = value.indexOf(quote, 1);
      value = end > 0 ? value.slice(1, end) : value.slice(1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    found = value; // last assignment wins, as it does for dotenv
  }
  return found;
}

const keyCache = new Map<string, { mtimeMs: number; key: string }>();

/** The API_SERVER_KEY a `/p/<profile>/` request must carry, or "" if none is configured. */
export function profileApiKey(profile: string): string {
  const fromEnv = process.env[profileKeyEnvName(profile)];
  if (fromEnv?.trim()) return fromEnv.trim();
  const file = path.join(profileDir(profile), ".env");
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    return "";
  }
  const cached = keyCache.get(file);
  if (cached && cached.mtimeMs === mtimeMs) return cached.key;
  let key = "";
  try {
    key = readDotenvValue(fs.readFileSync(file, "utf8"), "API_SERVER_KEY")?.trim() ?? "";
  } catch {
    key = "";
  }
  keyCache.set(file, { mtimeMs, key });
  return key;
}

/** Where a client sends its requests and what it authenticates with. */
interface Scope {
  profile: string | null;
  prefix: string;
  key: () => string;
}

function scopeFor(profile: string | null): Scope {
  if (!profile) return { profile: null, prefix: "", key: () => API_KEY };
  return {
    profile,
    prefix: `/p/${encodeURIComponent(profile)}`,
    key: () => profileApiKey(profile),
  };
}

/** Thrown before any request leaves when a profile has no key to send. */
function missingKeyError(profile: string): HermesApiError {
  return new HermesApiError(401, {
    error: {
      message:
        `The ${profile} profile has no API_SERVER_KEY. Add one to ` +
        `${path.join(profileDir(profile), ".env")} or set ${profileKeyEnvName(profile)}.`,
      code: "profile_key_missing",
    },
  });
}

function authHeader(scope: Scope): string {
  const key = scope.key();
  if (scope.profile && !key) throw missingKeyError(scope.profile);
  return `Bearer ${key}`;
}

async function hermesFetch<T>(
  scope: Scope,
  urlPath: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${scope.prefix}${urlPath}`, {
    ...init,
    headers: {
      Authorization: authHeader(scope),
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
async function hermesFetchStream(scope: Scope, urlPath: string): Promise<Response> {
  const res = await fetch(`${BASE_URL}${scope.prefix}${urlPath}`, {
    headers: { Authorization: authHeader(scope) },
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
  content_format?: "plain" | "markdown";
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

function createClient(scope: Scope) {
  return {
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
      }>(scope, `/api/sessions${qs ? `?${qs}` : ""}`);
    },

    async createSession(params: { id: string; title?: string }) {
      const res = await hermesFetch<{ object: "hermes.session"; session: HermesSession }>(
        scope,
        "/api/sessions",
        { method: "POST", body: JSON.stringify(params) },
      );
      return res.session;
    },

    /**
     * Exact-title lookup, which is how `hermes peer dm` finds a Bot's canonical
     * "Bot Chat". `include_hidden` is honoured only alongside a title — the
     * Desktop hides a Bot Chat, and an unfiltered list would miss it. Older
     * gateways ignore both params and return the recent window, so callers must
     * still compare titles themselves.
     */
    findSessionsByTitle(title: string) {
      const q = new URLSearchParams({ title, include_hidden: "1", limit: "200" });
      return hermesFetch<{ object: "list"; data: HermesSession[] }>(
        scope,
        `/api/sessions?${q.toString()}`,
      );
    },

    /** POST /api/sessions without an id — Hermes mints one. */
    async createTitledSession(title: string) {
      const res = await hermesFetch<{ object: "hermes.session"; session: HermesSession }>(
        scope,
        "/api/sessions",
        { method: "POST", body: JSON.stringify({ title }) },
      );
      return res.session;
    },

    async getSession(id: string) {
      const res = await hermesFetch<{ object: "hermes.session"; session: HermesSession }>(
        scope,
        `/api/sessions/${id}`,
      );
      return res.session;
    },

    async patchSession(id: string, params: { title?: string; end_reason?: string }) {
      const res = await hermesFetch<{ object: "hermes.session"; session: HermesSession }>(
        scope,
        `/api/sessions/${id}`,
        { method: "PATCH", body: JSON.stringify(params) },
      );
      return res.session;
    },

    deleteSession(id: string) {
      return hermesFetch<void>(scope, `/api/sessions/${id}`, { method: "DELETE" });
    },

    getMessages(id: string) {
      return hermesFetch<{
        object: "list";
        session_id: string;
        data: HermesMessage[];
      }>(scope, `/api/sessions/${id}/messages`);
    },

    async forkSession(id: string, params?: { id?: string; title?: string }) {
      const res = await hermesFetch<{ object: "hermes.session"; session: HermesSession }>(
        scope,
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
      return hermesFetch<StartRunResult>(scope, "/v1/runs", {
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
      return hermesFetchStream(scope, `/v1/runs/${runId}/events`);
    },

    getRun(runId: string) {
      return hermesFetch<{ status: string; [key: string]: unknown }>(
        scope,
        `/v1/runs/${runId}`,
      );
    },

    stopRun(runId: string) {
      return hermesFetch<void>(scope, `/v1/runs/${runId}/stop`, { method: "POST" });
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
        scope,
        `/v1/runs/${runId}/steer`,
        { method: "POST", body: JSON.stringify({ input: text }) },
      );
    },

    /**
     * POST /v1/runs/{id}/approval. A gateway under session authority answers
     * one exact prompt and rejects any other key set, so `ref` (from the
     * request event) switches the body to `{request_id, execution_generation,
     * choice}` and drops `all`. Without it, the legacy body.
     */
    approveRun(
      runId: string,
      choice: "once" | "session" | "always" | "deny",
      all?: boolean,
      ref: PromptRef | null = null,
    ) {
      return hermesFetch<void>(scope, `/v1/runs/${runId}/approval`, {
        method: "POST",
        body: JSON.stringify(promptResponseBody(ref, "choice", choice, { all })),
      });
    },

    /**
     * POST /v1/runs/{id}/clarify — answer the question the agent's clarify
     * tool asked mid-run. Session authority only; the body is always the
     * exact `{request_id, execution_generation, answer}` set.
     */
    clarifyRun(runId: string, answer: string, ref: PromptRef) {
      return hermesFetch<Record<string, unknown>>(scope, `/v1/runs/${runId}/clarify`, {
        method: "POST",
        body: JSON.stringify(promptResponseBody(ref, "answer", answer)),
      });
    },

    /**
     * POST /v1/runs/{id}/resolve-unknown — acknowledge a run whose owner was
     * lost mid-turn. Until it is, later turns in that session wait behind it.
     * Session authority only (`features.run_unknown_resolution`); both values
     * come from `GET /v1/runs/{id}`.
     */
    resolveUnknownRun(runId: string, admissionId: string, generation: number) {
      return hermesFetch<Record<string, unknown>>(scope, `/v1/runs/${runId}/resolve-unknown`, {
        method: "POST",
        body: JSON.stringify({ admission_id: admissionId, execution_generation: generation }),
      });
    },

    health() {
      return hermesFetch<{ status: string }>(scope, "/health");
    },

    /** GET /health/detailed — platform and runtime state behind `/health`. */
    healthDetailed() {
      return hermesFetch<Record<string, unknown>>(scope, "/health/detailed");
    },

    capabilities() {
      return hermesFetch<Record<string, unknown>>(scope, "/v1/capabilities");
    },

    /** GET /v1/skills — metadata only; there is no endpoint for a skill's body. */
    skills() {
      return hermesFetch<{ object: "list"; data: HermesSkill[] }>(scope, "/v1/skills");
    },

    toolsets() {
      return hermesFetch<{ object: "list"; data: HermesToolset[] }>(scope, "/v1/toolsets");
    },

    /**
     * GET /api/model/options. Slow — it enriches with provider catalogues and
     * pricing — so /api/models memoises the result rather than calling this on
     * every picker open.
     */
    modelOptions(refresh = false) {
      return hermesFetch<{ providers: HermesModelProvider[]; [k: string]: unknown }>(
        scope,
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
        return hermesFetch<{ jobs: HermesJob[] }>(scope, `/api/jobs${qs}`);
      },

      get(jobId: string) {
        return hermesFetch<{ job: HermesJob }>(scope, `/api/jobs/${jobId}`);
      },

      create(params: CreateJobParams) {
        return hermesFetch<{ job: HermesJob }>(scope, "/api/jobs", {
          method: "POST",
          body: JSON.stringify(params),
        });
      },

      update(jobId: string, params: UpdateJobParams) {
        return hermesFetch<{ job: HermesJob }>(scope, `/api/jobs/${jobId}`, {
          method: "PATCH",
          body: JSON.stringify(params),
        });
      },

      remove(jobId: string) {
        // Also rmtree's ~/.hermes/cron/output/<job_id>/ upstream — our own
        // cron_deliveries rows are what survives it.
        return hermesFetch<{ ok: boolean }>(scope, `/api/jobs/${jobId}`, {
          method: "DELETE",
        });
      },

      pause(jobId: string) {
        return hermesFetch<{ job: HermesJob }>(scope, `/api/jobs/${jobId}/pause`, {
          method: "POST",
        });
      },

      resume(jobId: string) {
        return hermesFetch<{ job: HermesJob }>(scope, `/api/jobs/${jobId}/resume`, {
          method: "POST",
        });
      },

      /**
       * Sets next_run_at to now. It fires on the scheduler's next tick, not
       * synchronously — there is no run id and nothing to await, so the UI says
       * "queued" and the watcher picks the result up like any other fire.
       */
      runNow(jobId: string) {
        return hermesFetch<{ job: HermesJob }>(scope, `/api/jobs/${jobId}/run`, {
          method: "POST",
        });
      },
    },
  };
}

export type HermesClient = ReturnType<typeof createClient>;

/** The default profile — every project that is not bound to a Bot. */
export const hermes = createClient(scopeFor(null));

const profileClients = new Map<string, HermesClient>();

/**
 * The client for one profile: `/p/<profile>/...` with that profile's key.
 * null, "" and "default" all mean the unprefixed default listener, so an
 * unbound project behaves exactly as it always has.
 */
export function hermesFor(profile: string | null | undefined): HermesClient {
  const id = normalizeProfile(profile);
  if (!id) return hermes;
  let client = profileClients.get(id);
  if (!client) {
    client = createClient(scopeFor(id));
    profileClients.set(id, client);
  }
  return client;
}

/** GET /p/<profile>/health — unauthenticated, so it separates "not served" from "bad key". */
export async function probeProfileHealth(profile: string): Promise<number> {
  try {
    const res = await fetch(`${BASE_URL}${scopeFor(profile).prefix}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    return res.status;
  } catch {
    return 0;
  }
}
