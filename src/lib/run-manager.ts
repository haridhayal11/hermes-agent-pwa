import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { getAgentName } from "./app-settings";
import { APP_SLUG } from "./branding";
import { db, pruneOldRunEvents } from "./db";
import {
  hermes,
  HermesApiError,
  type ConversationHistoryEntry,
  type HermesContentPart,
} from "./hermes";
import { composeInstructions, parseSkills } from "./instructions";
import { outboxDirFor } from "./uploads";
import { RECOMMEND_FENCE, type Attachment } from "./chat-types";
import { sendToAll, type PushKind } from "./push";
import { autoNameSession, getProjectSession } from "./project-sessions";
import { markdownToPlainText } from "./markdown";

// api_server.py's /v1/runs event vocabulary (gateway/platforms/api_server.py,
// _handle_runs / _run_and_close). "run.cancelled" only fires via /stop.
const TERMINAL_EVENTS = new Set(["run.completed", "run.failed", "run.cancelled"]);
const ACTIVE_RUN_STATUSES = ["queued", "running", "waiting_for_approval"];
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

/* A run that finished while you were watching needs no notification. One that
 * ran long enough that you stopped watching does, even if the tab is still
 * open behind a lock screen — "attached" and "being read" are not the same
 * thing, and 60s is roughly where a task stops being interactive. */
const NOTIFY_AFTER_MS = 60_000;

/* An approval blocks the run until a human answers, and "a browser is
 * attached" is not the same as "a human is reading" — a locked phone still
 * holds the stream open. So the unwatched case pushes immediately, and the
 * watched case gets one nag on the same 60s clock the completion rule uses. */
const APPROVAL_NAG_MS = 60_000;

// The upstream event queue is destroyed on disconnect (api_server.py pops the
// registry entry in a `finally`) and unconsumed buffers expire after five
// minutes, so there is no point polling for a settle beyond that.
const POLL_CEILING_MS = 5 * 60_000;

export interface RunEventRow {
  runId: string;
  seq: number;
  event: Record<string, unknown>;
  ts: number;
}

interface ProjectRow {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  session_id: string;
  cwd: string | null;
  instructions: string | null;
  pinned: number;
  skills: string | null;
  model: string | null;
  provider: string | null;
  model_options: string | null;
  archived: number;
}

interface RunRow {
  run_id: string;
  project_id: string;
  session_id: string;
  status: string;
  started_at: number;
  ended_at: number | null;
  prompt_preview: string | null;
}

interface ScheduledReportContext {
  job_name: string;
  status: string;
  body: string;
  ts: number;
}

export function scheduledReportHistoryEntry(
  report: ScheduledReportContext,
): ConversationHistoryEntry {
  const label = report.status === "failed" ? "failed scheduled report" : "scheduled report";
  return {
    role: "assistant",
    content: `[${label} from "${report.job_name}" at ${new Date(report.ts).toISOString()}]\n${report.body}`,
  };
}

/**
 * Builds the run's `input`.
 *
 * Files can't be attached at all — Hermes answers 400 for document content —
 * so their absolute paths are stated in the text instead, for the agent to
 * open with its own file tools. The host is the same machine, which is the
 * only reason that works. Images become `image_url` parts, and the input has
 * to become an array for them; with no images it stays a plain string, which
 * is what every existing run has sent.
 */
function composeInput(
  text: string,
  attachments: Attachment[],
): string | HermesContentPart[] {
  const files = attachments.filter((a) => a.kind === "file");
  const images = attachments.filter((a) => a.kind === "image");

  // Every attachment's path is named in the text, images included. Two
  // reasons: the agent can reopen an image on a later turn instead of only
  // seeing it in the one run it was inlined into, and the thread re-discovers
  // the same paths when it reloads history — which is text-only — so the turn
  // still shows its attachments tomorrow.
  const lines: string[] = [];
  if (files.length > 0) {
    lines.push("", files.length === 1 ? "Attached file:" : "Attached files:");
    for (const file of files) lines.push(`- ${file.path}`);
  }
  const imagePaths = images.filter((image) => image.path);
  if (imagePaths.length > 0) {
    lines.push("", imagePaths.length === 1 ? "Attached image:" : "Attached images:");
    for (const image of imagePaths) lines.push(`- ${image.path}`);
  }

  const withPaths = lines.length > 0 ? [text, ...lines].join("\n") : text;

  if (images.length === 0) return withPaths;

  const parts: HermesContentPart[] = [];
  // An empty text part is not worth sending — a photo with no caption is a
  // legitimate message, and the normaliser has no use for "".
  if (withPaths.trim()) parts.push({ type: "text", text: withPaths });
  for (const image of images) {
    parts.push({ type: "image_url", image_url: { url: image.url } });
  }
  return parts;
}

/**
 * `{reasoning: {enabled, effort}, fast}` as api_server.py's
 * `_request_reasoning_config` / `_request_service_tier` read it. Returns
 * undefined for null, empty and unparseable values alike so a corrupted
 * column can never fail a send.
 */
function parseModelOptions(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const obj = parsed as Record<string, unknown>;
    return Object.keys(obj).length > 0 ? obj : undefined;
  } catch {
    return undefined;
  }
}

// Next dev's HMR would otherwise spin up a second manager (and a second
// upstream SSE connection per run) on every edit — pin the singleton globally.
const globalForRunManager = globalThis as unknown as {
  __hermesPwaRunManager?: RunManager;
};

class RunManager extends EventEmitter {
  /** runId -> pending approval nag, cleared when the approval is answered. */
  private approvalNags = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    super();
    this.setMaxListeners(0);
  }

  /**
   * The project-wide channel, for things that belong in a thread but are not
   * part of a run — today, a cron job delivering into it. Runs have their own
   * per-runId channel with a persisted replay log; this one is live-only,
   * because the durable copy is a cron_deliveries row that the history route
   * merges in on reload.
   */
  emitProject(projectId: string, sessionId: string, event: Record<string, unknown>) {
    this.emit(`project:${projectId}`, event);
    this.emit(`project:${projectId}:session:${sessionId}`, event);
  }

  subscribeProject(
    projectId: string,
    onEvent: (event: Record<string, unknown>) => void,
    sessionId?: string,
  ): () => void {
    const listener = (event: Record<string, unknown>) => onEvent(event);
    const channel = sessionId
      ? `project:${projectId}:session:${sessionId}`
      : `project:${projectId}`;
    this.on(channel, listener);
    return () => this.off(channel, listener);
  }

  getProject(projectId: string): ProjectRow | undefined {
    return db
      .prepare(`SELECT * FROM projects WHERE id = ?`)
      .get(projectId) as ProjectRow | undefined;
  }

  getActiveRun(projectId: string, sessionId?: string): RunRow | undefined {
    if (sessionId) {
      return db
        .prepare(
          `SELECT * FROM runs
            WHERE project_id = ? AND session_id = ?
              AND status IN (${ACTIVE_RUN_STATUSES.map(() => "?").join(",")})
            ORDER BY started_at DESC LIMIT 1`,
        )
        .get(projectId, sessionId, ...ACTIVE_RUN_STATUSES) as RunRow | undefined;
    }
    // Compatibility callers without a session mean the project's shared
    // active session, not every branch below it.
    return db
      .prepare(
        `SELECT r.* FROM runs r
           JOIN projects p ON p.id = r.project_id AND p.session_id = r.session_id
          WHERE r.project_id = ?
            AND r.status IN (${ACTIVE_RUN_STATUSES.map(() => "?").join(",")})
          ORDER BY r.started_at DESC LIMIT 1`,
      )
      .get(projectId, ...ACTIVE_RUN_STATUSES) as RunRow | undefined;
  }

  getRun(runId: string): RunRow | undefined {
    return db.prepare(`SELECT * FROM runs WHERE run_id = ?`).get(runId) as
      | RunRow
      | undefined;
  }

  /**
   * The project's most recent run *in the session it currently points at*.
   *
   * Scoped to the session deliberately. `/new` repoints the project at a
   * fresh session but leaves the old runs in place, and the stream route
   * falls back to this when nothing is active — so unscoped, a thread that
   * had just been reset would resolve to the abandoned session's last run,
   * replay it whole from after_seq=-1, and paint the discarded transcript
   * straight back into the empty thread.
   */
  getLatestRun(projectId: string, sessionId?: string): RunRow | undefined {
    if (sessionId) {
      return db
        .prepare(
          `SELECT * FROM runs WHERE project_id = ? AND session_id = ?
           ORDER BY started_at DESC LIMIT 1`,
        )
        .get(projectId, sessionId) as RunRow | undefined;
    }
    return db
      .prepare(
        `SELECT r.* FROM runs r
           JOIN projects p ON p.id = r.project_id AND p.session_id = r.session_id
         WHERE r.project_id = ?
         ORDER BY r.started_at DESC LIMIT 1`,
      )
      .get(projectId) as RunRow | undefined;
  }

  /**
   * Start a run, steer the one in flight, or queue behind it.
   *
   * Steering is preferred while a run is active because it lands in the same
   * turn — the agent changes course instead of finishing the wrong thing and
   * then reading your correction. Hermes only accepts it while the run's
   * status is exactly "running" (api_server.py `_handle_steer_run`), so
   * waiting_for_approval, the window after /stop, and any older Hermes
   * without the endpoint all come back 409/404 and fall through to the queue.
   *
   * `mode` is "queued" whenever the message did not reach the agent yet, so
   * the caller can keep rendering a queued row for it.
   */
  async sendMessage(
    projectId: string,
    text: string,
    attachments: Attachment[] = [],
    opts: { prefer?: "steer" | "queue"; sessionId?: string } = {},
  ): Promise<{ queued: boolean; mode: "started" | "steered" | "queued"; runId: string }> {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const sessionId = opts.sessionId ?? project.session_id;
    if (!getProjectSession(projectId, sessionId)) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    const active = this.getActiveRun(projectId, sessionId);
    if (!active) {
      const runId = await this.startRun(projectId, text, attachments, sessionId);
      return { queued: false, mode: "started", runId };
    }

    // Steer carries text only — there is no attachment form — so anything
    // with a file or an image has to wait for its own run to inline it.
    const steerable =
      opts.prefer !== "queue" && attachments.length === 0 && text.trim().length > 0;
    if (steerable && (await this.trySteer(active.run_id, text.trim()))) {
      return { queued: false, mode: "steered", runId: active.run_id };
    }

    const id = `qm_${randomUUID()}`;
    // body_json was already JSON, so carrying attachments through the queue
    // needs no migration — an older row simply has no `attachments` key.
    db.prepare(
      `INSERT INTO queued_messages
        (id, project_id, session_id, body_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, projectId, sessionId, JSON.stringify({ text, attachments }), Date.now());
    return { queued: true, mode: "queued", runId: active.run_id };
  }

  /**
   * True when Hermes accepted the steer. Every failure is a false, not a
   * throw: the caller's fallback (queue it) is correct for all of them —
   * 409 the run moved on, 404 the endpoint predates this Hermes, anything
   * else the gateway is unwell and the queue is the safe place for the text.
   */
  private async trySteer(runId: string, text: string): Promise<boolean> {
    try {
      const res = await hermes.steerRun(runId, text);
      if (!res?.accepted) return false;
      // api_server emits its own run.steered, and consumeStream persists it —
      // but it carries only `accepted`, never the text. This second row is
      // the only record of *what* was steered, which is what a device that
      // wasn't attached at the time needs to render the turn correctly.
      // useThread ignores a run.steered with no text, so the pair renders once.
      this.appendEvent(runId, {
        event: "run.steered",
        run_id: runId,
        accepted: true,
        text,
        local: true,
      });
      return true;
    } catch (err) {
      if (!(err instanceof HermesApiError)) {
        console.error(`[run-manager] steer failed for ${runId}:`, err);
      }
      return false;
    }
  }

  private async buildConversationHistory(
    sessionId: string,
  ): Promise<ConversationHistoryEntry[]> {
    const scheduled = db
      .prepare(
        `SELECT d.job_name, d.status, d.body, d.ts
           FROM cron_discussions c
           JOIN cron_deliveries d ON d.id = c.delivery_id
          WHERE c.session_id = ?`,
      )
      .get(sessionId) as ScheduledReportContext | undefined;
    let history: ConversationHistoryEntry[] = [];
    try {
      const res = await hermes.getMessages(sessionId);
      history = res.data
        .filter(
          (m) =>
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.length > 0,
        )
        .map((m) => ({ role: m.role, content: m.content as string }));
    } catch {
      // Brand-new session, or session DB hiccup — its linked report remains
      // available even when there is no Hermes transcript to append.
    }
    if (!scheduled) return history;
    return [scheduledReportHistoryEntry(scheduled), ...history];
  }

  async startRun(
    projectId: string,
    text: string,
    attachments: Attachment[] = [],
    sessionId?: string,
  ): Promise<string> {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const targetSessionId = sessionId ?? project.session_id;
    if (!getProjectSession(projectId, targetSessionId)) {
      throw new Error(`Unknown session: ${targetSessionId}`);
    }

    const conversationHistory = await this.buildConversationHistory(
      targetSessionId,
    );
    const { run_id: runId } = await hermes.startRun({
      sessionId: targetSessionId,
      input: composeInput(text, attachments),
      conversationHistory,
      // Re-sent every run so the project's framing outlives compaction.
      instructions: composeInstructions({
        ...project,
        skills: parseSkills(project.skills),
        outboxDir: outboxDirFor(project.id),
      }),
      sessionKey: project.id,
      // NULL columns drop out as undefined and Hermes falls back to the
      // gateway default, which is what every project did before the picker.
      model: project.model ?? undefined,
      provider: project.provider ?? undefined,
      modelOptions: parseModelOptions(project.model_options),
    });

    const startedAt = Date.now();
    db.prepare(
      `INSERT INTO runs (run_id, project_id, session_id, status, started_at, prompt_preview)
       VALUES (?, ?, ?, 'queued', ?, ?)`,
    ).run(
      runId,
      projectId,
      targetSessionId,
      startedAt,
      // A photo with no caption still deserves a searchable, notifiable
      // preview — the filenames are all there is.
      (text.trim() || attachments.map((a) => a.name).join(", ")).slice(0, 200),
    );
    db.prepare(`UPDATE projects SET last_active_at = ? WHERE id = ?`).run(
      startedAt,
      projectId,
    );
    db.prepare(
      `UPDATE project_sessions SET last_active_at = ? WHERE session_id = ?`,
    ).run(startedAt, targetSessionId);
    void autoNameSession(projectId, targetSessionId, text);

    // Fire-and-forget: this holds the one allowed upstream connection to
    // Hermes for the run's whole life and must not be dropped on our side.
    this.attach(runId, projectId).catch((err) => {
      console.error(`[run-manager] attach failed for ${runId}:`, err);
      this.finishRun(runId, "failed", true);
    });

    return runId;
  }

  private appendEvent(runId: string, event: Record<string, unknown>): number {
    const row = db
      .prepare(
        `SELECT COALESCE(MAX(seq), -1) AS maxSeq FROM run_events WHERE run_id = ?`,
      )
      .get(runId) as { maxSeq: number };
    const seq = row.maxSeq + 1;
    db.prepare(
      `INSERT INTO run_events (run_id, seq, event_json, ts) VALUES (?, ?, ?, ?)`,
    ).run(runId, seq, JSON.stringify(event), Date.now());
    const payload: RunEventRow = { runId, seq, event, ts: Date.now() };
    this.emit(runId, payload);

    // An approval blocks the run indefinitely. If nobody is looking at the
    // stream, nothing else will ever say so.
    if (event.event === "approval.request") {
      if (this.hasSubscribers(runId)) this.armApprovalNag(runId);
      else void this.notify(runId, "approval");
    }
    // Answered, or the run moved on without one — either way stop nagging.
    if (
      event.event === "approval.responded" ||
      (typeof event.event === "string" && TERMINAL_EVENTS.has(event.event))
    ) {
      this.clearApprovalNag(runId);
    }
    return seq;
  }

  /**
   * One delayed push for an approval that a browser is attached to.
   *
   * The attached case used to be silent on the theory that someone was
   * watching. They are not: iOS suspends the tab on lock and the EventSource
   * stays open, so the run can sit blocked behind a lock screen with nothing
   * to announce it. The nag fires once, only if the approval is still
   * outstanding, and never re-arms — a second buzz for the same decision is
   * nagging, not notifying.
   */
  private armApprovalNag(runId: string) {
    if (this.approvalNags.has(runId)) return;
    const timer = setTimeout(() => {
      this.approvalNags.delete(runId);
      const run = this.getRun(runId);
      if (!run || run.status !== "waiting_for_approval") return;
      void this.notify(runId, "approval");
    }, APPROVAL_NAG_MS);
    // Node keeps the process alive for a pending timer; a run's approval must
    // never be the reason the server refuses to shut down.
    timer.unref?.();
    this.approvalNags.set(runId, timer);
  }

  private clearApprovalNag(runId: string) {
    const timer = this.approvalNags.get(runId);
    if (!timer) return;
    clearTimeout(timer);
    this.approvalNags.delete(runId);
  }

  /**
   * What the agent actually said, reassembled from the message.delta log.
   *
   * Ours rather than Hermes': the transcript is fetched separately by the
   * browser, and a notification must not wait on a round trip to build its
   * own body.
   */
  private runText(runId: string): string {
    const rows = db
      .prepare(
        `SELECT event_json FROM run_events WHERE run_id = ? ORDER BY seq ASC`,
      )
      .all(runId) as { event_json: string }[];

    let text = "";
    for (const row of rows) {
      try {
        const event = JSON.parse(row.event_json) as {
          event?: string;
          delta?: unknown;
        };
        if (event.event === "message.delta" && typeof event.delta === "string") {
          text += event.delta;
        }
      } catch {
        // a malformed row must not cost the notification
      }
    }
    return text;
  }

  /**
   * The opening of the reply, for a completion notification.
   *
   * This used to be `prompt_preview` — the user's own message — so finishing a
   * run buzzed the phone with the text they had just typed. It read as a
   * notification *of their own message* rather than of the answer, which is
   * both useless and confusing. The reply is the news.
   *
   * Fenced blocks are dropped first: a turn that opens with a code block or a
   * `${RECOMMEND_FENCE}` card would otherwise notify with a brace.
   */
  private replyPreview(runId: string): string {
    return markdownToPlainText(this.runText(runId)).slice(0, 140);
  }

  /**
   * The recommendation card the run ended on, if it ended on one.
   *
   * A run that stops to ask something is `run.completed` like any other, so
   * "Finished." is exactly the wrong thing to say about it — the thread is
   * waiting on the reader and the notification is the only thing that can tell
   * them.
   */
  private pendingQuestion(runId: string): string | null {
    const text = this.runText(runId);
    if (!text.includes(RECOMMEND_FENCE)) return null;

    // Last fence wins: the agent may quote the format before using it.
    const fences = [
      ...text.matchAll(new RegExp("```" + RECOMMEND_FENCE + "\\s*([\\s\\S]*?)```", "g")),
    ];
    const last = fences[fences.length - 1];
    if (!last) return null;
    try {
      const card = JSON.parse(last[1]) as { kind?: string; title?: string };
      if (card.kind !== "question") return null;
      return typeof card.title === "string" && card.title.trim()
        ? card.title.trim()
        : "Waiting on your answer.";
    } catch {
      return null;
    }
  }

  /** True while at least one browser is attached to this run's stream. */
  private hasSubscribers(runId: string): boolean {
    return this.listenerCount(runId) > 0;
  }

  /**
   * Web Push for a run the user is not watching. Best-effort by design — the
   * run's own bookkeeping must not depend on a phone being reachable.
   */
  private async notify(
    runId: string,
    kind: PushKind,
    status?: string,
    detail?: string,
  ) {
    try {
      const run = this.getRun(runId);
      if (!run) return;
      const project = this.getProject(run.project_id);
      const name = project?.name ?? getAgentName();
      // The prompt is the fallback, never the headline: it is the one piece of
      // this the reader already knows, because they wrote it.
      const prompt = run.prompt_preview?.trim().slice(0, 120) ?? "";

      const body =
        kind === "approval"
          ? "Waiting for your approval."
          : kind === "question"
            ? detail || "Waiting on your answer."
            : status === "failed"
              ? `Run failed.${prompt ? ` ${prompt}` : ""}`
              : status === "cancelled"
                ? "Run stopped."
                : this.replyPreview(runId) || "Finished.";

      await sendToAll({
        title: name,
        body,
        url: `/p/${run.project_id}/s/${run.session_id}`,
        tag: `${APP_SLUG}-${run.project_id}-${run.session_id}`,
        kind,
      });
    } catch (err) {
      console.error(`[run-manager] push notify failed for ${runId}:`, err);
    }
  }

  private finishRun(runId: string, status: string, emitSyntheticClose = false) {
    const started = this.getRun(runId)?.started_at ?? Date.now();
    // Read before the close events go out: subscribers unsubscribe the moment
    // they see the run end, so asking afterwards always says "nobody".
    const watched = this.hasSubscribers(runId);
    this.clearApprovalNag(runId);

    db.prepare(
      `UPDATE runs SET status = ?, ended_at = ? WHERE run_id = ?`,
    ).run(status, Date.now(), runId);
    // Only synthesize a close event when there's no real terminal event to
    // tell subscribers the run is over (our attach() loop ending abnormally
    // without ever seeing run.completed/failed/cancelled from Hermes).
    if (emitSyntheticClose) {
      this.emit(runId, { runId, seq: -1, event: { event: "_local.closed" }, ts: Date.now() });
    }
    this.emit(`${runId}:closed`);

    if (!watched || Date.now() - started > NOTIFY_AFTER_MS) {
      const question = status === "completed" ? this.pendingQuestion(runId) : null;
      if (question) void this.notify(runId, "question", status, question);
      else void this.notify(runId, "run", status);
    }

    // The replay log only has to outlive a phone being locked; a day is
    // generous. Doing it here means it never needs a cron.
    try {
      pruneOldRunEvents();
    } catch (err) {
      console.error("[run-manager] pruneOldRunEvents failed:", err);
    }

    const run = this.getRun(runId);
    if (run) this.drainQueue(run.project_id, run.session_id).catch((err) => {
      console.error(
        `[run-manager] drainQueue failed for ${run.project_id}/${run.session_id}:`,
        err,
      );
    });
  }

  private async drainQueue(projectId: string, sessionId: string) {
    const next = db
      .prepare(
        `SELECT * FROM queued_messages
          WHERE project_id = ? AND session_id = ?
          ORDER BY created_at ASC LIMIT 1`,
      )
      .get(projectId, sessionId) as
      | { id: string; project_id: string; session_id: string; body_json: string }
      | undefined;
    if (!next) return;
    db.prepare(`DELETE FROM queued_messages WHERE id = ?`).run(next.id);
    const body = JSON.parse(next.body_json) as {
      text: string;
      attachments?: Attachment[];
    };
    await this.startRun(projectId, body.text, body.attachments ?? [], sessionId);
  }

  /**
   * Holds the single upstream SSE connection to Hermes for one run's whole
   * life. Returns true when the stream ended on a real terminal event.
   */
  private async consumeStream(runId: string): Promise<boolean> {
    const res = await hermes.streamRunEvents(runId);
    const body = res.body;
    if (!body) throw new Error("Hermes run stream had no body");

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let closedByTerminalEvent = false;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIndex: number;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawFrame = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);
          for (const line of rawFrame.split("\n")) {
            if (!line.startsWith("data: ")) continue; // skip ": keepalive" etc.
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            this.appendEvent(runId, parsed);
            if (typeof parsed.event === "string" && TERMINAL_EVENTS.has(parsed.event)) {
              closedByTerminalEvent = true;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return closedByTerminalEvent;
  }

  /**
   * Owns one run from start to settled.
   *
   * If the upstream stream drops before a terminal event, this does *not* try
   * to resume it. It cannot: `/v1/runs/{id}/events` is a single-consumer queue
   * that api_server.py destroys in a `finally` on disconnect, so a "successful"
   * reattach would silently skip every token emitted in the gap. One reattach
   * is still attempted, because it costs a request and works in the case that
   * matters — our own fetch failing before the run ever registered. After that
   * the only honest option is to poll `GET /v1/runs/{id}` for the final status
   * and synthesise the terminal event ourselves, so the browser, the queue and
   * the push notification all still settle. Partial output already in
   * run_events is kept.
   */
  private async attach(runId: string, projectId: string) {
    void projectId; // reserved: per-project attach bookkeeping

    let settledByStream = false;
    for (let attempt = 0; attempt < 2 && !settledByStream; attempt += 1) {
      try {
        settledByStream = await this.consumeStream(runId);
      } catch (err) {
        console.error(`[run-manager] stream attempt ${attempt} for ${runId}:`, err);
      }
      if (!settledByStream && attempt === 0 && !(await this.isStillRunning(runId))) {
        break; // it finished while we were disconnected — poll below settles it
      }
    }

    if (settledByStream) {
      this.finishRun(runId, this.lastKnownStatus(runId));
      return;
    }

    const status = await this.pollUntilSettled(runId);
    if (status) {
      // Synthesised, not received: subscribers replaying from run_events must
      // see the run end even though Hermes never got the chance to say so.
      this.appendEvent(runId, { event: `run.${status}`, run_id: runId, synthesized: true });
      this.finishRun(runId, status);
      return;
    }

    this.finishRun(runId, "failed", true);
  }

  private async isStillRunning(runId: string): Promise<boolean> {
    try {
      const run = await hermes.getRun(runId);
      return !TERMINAL_STATUSES.has(run.status);
    } catch {
      return false;
    }
  }

  /**
   * Polls /v1/runs/{id} on a 1s→15s backoff. Resolves with the terminal status
   * ("completed" | "failed" | "cancelled"), or null if it never settles inside
   * the window the upstream buffers would have survived anyway.
   */
  private async pollUntilSettled(runId: string): Promise<string | null> {
    const deadline = Date.now() + POLL_CEILING_MS;
    let delay = 1000;
    let consecutiveErrors = 0;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 15_000);
      try {
        const run = await hermes.getRun(runId);
        consecutiveErrors = 0;
        if (TERMINAL_STATUSES.has(run.status)) return run.status;
      } catch (err) {
        // The run id is gone from Hermes' registry — nothing left to wait for.
        const status = (err as { status?: number }).status;
        if (status === 404) return "failed";
        // Otherwise Hermes itself is unreachable. Waiting out the full ceiling
        // would leave the thread spinning and the queue stalled for five
        // minutes over a service that is plainly down; give up after three.
        consecutiveErrors += 1;
        if (consecutiveErrors >= 3) return null;
      }
    }
    return null;
  }

  private lastKnownStatus(runId: string): string {
    const rows = db
      .prepare(
        `SELECT event_json FROM run_events WHERE run_id = ? ORDER BY seq DESC LIMIT 1`,
      )
      .get(runId) as { event_json: string } | undefined;
    if (!rows) return "completed";
    const event = JSON.parse(rows.event_json) as { event?: string };
    if (event.event === "run.failed") return "failed";
    if (event.event === "run.cancelled") return "cancelled";
    return "completed";
  }

  async stopRun(runId: string) {
    await hermes.stopRun(runId);
  }

  async approveRun(
    runId: string,
    choice: "once" | "session" | "always" | "deny",
    all?: boolean,
  ) {
    await hermes.approveRun(runId, choice, all);
  }

  /** Replays persisted events after `afterSeq`, then live-streams new ones until unsubscribed. */
  subscribe(
    runId: string,
    afterSeq: number,
    onEvent: (row: RunEventRow) => void,
  ): () => void {
    const backlog = db
      .prepare(
        `SELECT seq, event_json, ts FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC`,
      )
      .all(runId, afterSeq) as { seq: number; event_json: string; ts: number }[];
    for (const row of backlog) {
      onEvent({ runId, seq: row.seq, event: JSON.parse(row.event_json), ts: row.ts });
    }

    const listener = (row: RunEventRow) => onEvent(row);
    this.on(runId, listener);
    return () => this.off(runId, listener);
  }
}

export const runManager = globalForRunManager.__hermesPwaRunManager ?? new RunManager();
if (!globalForRunManager.__hermesPwaRunManager)
  globalForRunManager.__hermesPwaRunManager = runManager;
