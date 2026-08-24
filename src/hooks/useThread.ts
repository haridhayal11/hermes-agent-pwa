"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRunStream, type StreamEvent } from "@/hooks/useRunStream";
import { usePreferences } from "@/components/PreferencesContext";
import type {
  Attachment,
  PendingApproval,
  RunPhase,
  SubagentRun,
  ThreadMessage,
  ToolCall,
} from "@/lib/chat-types";

/* Everything the thread UI needs, derived from our replayable SSE stream.
 * The components downstream are presentational — no scripted timers, no
 * demo state machines; every phase change here comes off the wire.
 *
 * The /v1/runs vocabulary on Hermes 0.20.5 is:
 *
 *   message.delta  tool.started  tool.completed  reasoning.available
 *   subagent.start  subagent.complete  approval.request  approval.responded
 *   run.steered  run.stopping  run.completed  run.failed  run.cancelled
 *
 * Notably absent: `run.started` and `hermes.tool.progress` — both exist only
 * on the /api/sessions/{id}/chat/stream path, and `_thinking` is explicitly
 * withheld from the run stream as "high-volume UI noise"
 * (api_server.py `_make_run_event_callback`). Anything this switch handles
 * that isn't in that list is there for older builds. */

export interface ThreadState {
  messages: ThreadMessage[];
  /** assistant text for the run in flight */
  streaming: string;
  /** interstitial reasoning for the run in flight — see the reasoning.available note */
  thinking: string;
  tools: ToolCall[];
  subagents: SubagentRun[];
  phase: RunPhase;
  approval: PendingApproval | null;
  runId: string | null;
  startedAt: number | null;
  queued: string[];
  error: string | null;
  errorSeq: number;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/* Hermes names the tool in `tool`, not `tool_name`, and sends no
 * `tool_call_id` at all — verified against the persisted event log:
 *
 *   {"event":"tool.started",  "tool":"skill_view","preview":"daily-planner"}
 *   {"event":"tool.completed","tool":"skill_view","duration":0.035,"error":false}
 *
 * Reading `tool_name` meant every row was labelled with the literal fallback
 * "tool", and completion could never be matched back to the started call, so
 * the spinners ran forever. `tool_name` is kept as a fallback because other
 * Hermes versions may use it — the constraint notes in CLAUDE.md exist
 * precisely because this API's payloads differ between builds. */
function toolName(evt: StreamEvent): string | undefined {
  return str(evt.tool) ?? str(evt.tool_name);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function commandText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value == null) return null;
  return JSON.stringify(value, null, 2);
}

export function useThread(projectId: string, initialMessages: ThreadMessage[]) {
  const { prefs } = usePreferences();
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState("");
  const [thinking, setThinking] = useState("");
  const [tools, setTools] = useState<ToolCall[]>([]);
  const [subagents, setSubagents] = useState<SubagentRun[]>([]);
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [queued, setQueued] = useState<string[]>([]);
  const [error, setErrorMessage] = useState<string | null>(null);
  // bumped on every raised error so the composer can restart its shake
  // without the thread having to diff the message text
  const [errorSeq, setErrorSeq] = useState(0);

  const setError = useCallback((message: string) => {
    setErrorMessage(message);
    setErrorSeq((seq) => seq + 1);
  }, []);

  const runIdRef = useRef<string | null>(null);
  const streamingRef = useRef("");

  /* Hermes 0.20.5 fires `reasoning.available` after every assistant message in
   * the agent loop, carrying that message's own content — which `message.delta`
   * has already streamed. On the last iteration it duplicates the final answer;
   * on the ones in between it is the narration the model wrote before reaching
   * for a tool. So the event is not new text, it is a *boundary*.
   *
   * We cut the stream at each boundary and hold the segment. If a tool.started
   * follows, that segment was interstitial and belongs in the thinking trace,
   * not the answer — so it moves there and comes out of the visible buffer. If
   * the run ends first, the segment was the answer and stays put.
   *
   * Cutting by index rather than matching text is deliberate: the event's own
   * `text` is truncated to 500 chars upstream, so it can't be used to find
   * where the segment starts. Its only job here is a fallback for providers
   * that don't stream content on tool-calling turns, which leaves the slice
   * empty. */
  const segmentStartRef = useRef(0);
  const pendingSegmentRef = useRef<{ slice: string; text: string } | null>(null);

  const resetSegments = useCallback(() => {
    segmentStartRef.current = 0;
    pendingSegmentRef.current = null;
  }, []);

  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);
  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  const refreshMessages = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/messages`);
    if (!res.ok) return;
    const body = (await res.json()) as {
      messages: {
        id?: string;
        role: string;
        content?: unknown;
        cron?: ThreadMessage["cron"];
      }[];
    };
    setMessages(
      body.messages
        .filter(
          (m) =>
            typeof m.content === "string" &&
            m.content.length > 0 &&
            (m.role === "user" ||
              m.role === "assistant" ||
              m.role === "system" ||
              m.role === "cron"),
        )
        .map((m, i) => ({
          id: m.id ?? `msg_${i}`,
          role: m.role as ThreadMessage["role"],
          content: m.content as string,
          // Only cron messages carry it; the route omits the key otherwise.
          ...(m.cron ? { cron: m.cron } : {}),
        })),
    );
  }, [projectId]);

  const startNewRun = useCallback((id: string) => {
    // set the ref synchronously: an event can land before the effect that
    // mirrors runId into it, and the stream handler would then read the run
    // as "new" and shift a message off the queue that never queued
    runIdRef.current = id;
    setRunId(id);
    setStartedAt(Date.now());
    setPhase("running");
    setStreaming("");
    setThinking("");
    setTools([]);
    setSubagents([]);
    setApproval(null);
    setErrorMessage(null);
    resetSegments();
  }, [resetSegments]);

  const onEvent = useCallback(
    (evt: StreamEvent) => {
      const kind = evt.event;

      // A queued message auto-started server-side: the stream hands us a new
      // run_id without any local send. Reset the in-flight buffers for it.
      if (evt.run_id && evt.run_id !== runIdRef.current) {
        runIdRef.current = evt.run_id;
        setRunId(evt.run_id);
        setStreaming("");
        setThinking("");
        setTools([]);
        setSubagents([]);
        resetSegments();
        setQueued((prev) => prev.slice(1));
      }

      switch (kind) {
        // /v1/runs streams message.delta; the session-chat fallback path
        // calls the same thing assistant.delta. There is no `run.started` on
        // /v1/runs — send() already put the thread into `running` before the
        // first frame could arrive, so nothing is waiting on one.
        case "message.delta":
        case "assistant.delta": {
          const delta = str(evt.delta);
          setPhase((current) =>
            current === "waiting_for_approval" || current === "stopping"
              ? current
              : "running",
          );
          if (delta)
            setStreaming((prev) => {
              streamingRef.current = prev + delta;
              return streamingRef.current;
            });
          break;
        }
        /* Not emitted on /v1/runs by 0.20.5 — `_thinking` and
         * hermes.tool.progress are both withheld from the run stream as
         * "high-volume UI noise". Kept for builds that do send it, same
         * reasoning as toolName()'s tool_name fallback below. */
        case "tool.progress": {
          const name = toolName(evt);
          const delta = str(evt.delta) ?? "";
          if (name === "_thinking") {
            setThinking((prev) => prev + delta);
            break;
          }
          setTools((prev) => {
            const index = prev.findLastIndex(
              (t) => t.name === name && t.status === "running",
            );
            if (index === -1) return prev;
            const next = [...prev];
            const detail = [...next[index].detail];
            // progress arrives as fragments of one growing line
            detail[detail.length - 1] = (detail[detail.length - 1] ?? "") + delta;
            next[index] = { ...next[index], detail };
            return next;
          });
          break;
        }
        case "reasoning.available": {
          // Close the current segment. Whether it was narration or the answer
          // is decided by what arrives next — see the note on segmentStartRef.
          const full = streamingRef.current;
          pendingSegmentRef.current = {
            slice: full.slice(segmentStartRef.current),
            text: str(evt.text) ?? "",
          };
          segmentStartRef.current = full.length;
          break;
        }
        case "tool.started": {
          // A tool call proves the segment before it was interstitial: move it
          // out of the answer and into the thinking trace.
          const pending = pendingSegmentRef.current;
          if (pending) {
            pendingSegmentRef.current = null;
            const traced = pending.slice.trim() || pending.text.trim();
            if (traced) {
              setThinking((prev) => (prev ? `${prev}\n\n${traced}` : traced));
            }
            if (pending.slice) {
              const cut = segmentStartRef.current - pending.slice.length;
              setStreaming((prev) => {
                const next = prev.slice(0, cut) + prev.slice(segmentStartRef.current);
                streamingRef.current = next;
                return next;
              });
              segmentStartRef.current = cut;
            }
          }
          const name = toolName(evt) ?? "tool";
          const id = str(evt.tool_call_id) ?? `${evt.run_id}:${evt.seq}`;
          setTools((prev) => [
            ...prev,
            {
              id,
              name,
              preview: str(evt.preview),
              status: "running",
              // Empty on 0.20.5, which sends no tool.progress on this stream —
              // so the row is not expandable and shows its preview chip only.
              // The case below fills it on builds that do stream progress.
              detail: [],
            },
          ]);
          break;
        }
        case "tool.completed":
        case "tool.failed": {
          const name = toolName(evt);
          const id = str(evt.tool_call_id);
          // there is no tool.failed in the versions checked — failure arrives
          // as tool.completed carrying error: true
          const failed = kind === "tool.failed" || evt.error === true;
          setTools((prev) => {
            const index = id
              ? prev.findIndex((t) => t.id === id)
              : // no correlation id, so the oldest still-running call of that
                // name is the one this completes. Hermes runs tools serially.
                prev.findIndex((t) => t.name === name && t.status === "running");
            if (index === -1) return prev;
            const next = [...prev];
            next[index] = {
              ...next[index],
              status: failed ? "failed" : "completed",
              preview: str(evt.preview) ?? next[index].preview,
            };
            return next;
          });
          break;
        }
        /* A scheduled job delivered into this project. Not part of any run —
         * it rides the project channel, carries no seq, and is durable on our
         * side as a cron_deliveries row, so a reload finds it again through
         * the history merge. Deduped on id because a reconnect can race the
         * refresh that already picked it up. */
        case "cron.delivered": {
          const delivery = evt.delivery as
            | {
                id?: string;
                job_id?: string;
                job_name?: string;
                status?: string;
                body?: string;
                ts?: number;
              }
            | undefined;
          if (!delivery?.id || typeof delivery.body !== "string") break;
          setMessages((prev) => {
            if (prev.some((m) => m.id === delivery.id)) return prev;
            return [
              ...prev,
              {
                id: delivery.id as string,
                role: "cron",
                content: delivery.body as string,
                cron: {
                  jobId: delivery.job_id ?? "",
                  jobName: delivery.job_name ?? "Scheduled job",
                  status: delivery.status === "failed" ? "failed" : "ok",
                  ts: typeof delivery.ts === "number" ? delivery.ts : Date.now(),
                },
              },
            ];
          });
          break;
        }
        case "approval.request": {
          setPhase("waiting_for_approval");
          // `choices` is authoritative — api_server derives it from
          // smart_denied/allow_permanent before the event leaves the process.
          // The flags come along so the card can explain a missing option
          // rather than silently offering fewer buttons.
          const smartDenied = evt.smart_denied === true;
          const allowPermanent = evt.allow_permanent !== false;
          const allowSession = evt.allow_session !== false;
          const fallback = smartDenied
            ? ["once", "deny"]
            : allowPermanent
              ? ["once", "session", "always", "deny"]
              : ["once", "session", "deny"];
          setApproval({
            runId: evt.run_id,
            command: commandText(evt.command),
            description: str(evt.description) ?? null,
            patternKey: str(evt.pattern_key) ?? null,
            choices: Array.isArray(evt.choices) ? (evt.choices as string[]) : fallback,
            allowPermanent,
            allowSession,
            smartDenied,
          });
          break;
        }
        case "approval.responded": {
          setApproval(null);
          setPhase((current) => (current === "stopping" ? current : "running"));
          break;
        }
        /* A mid-run message reached the agent. On the device that sent it the
         * optimistic user message is already on screen; on any other device —
         * or on this one after a reconnect replay — this event is the only
         * record that it happened, and run-manager persists the text for
         * exactly that. Dedupe on the tail rather than tracking ids. */
        case "run.steered": {
          const text = str(evt.text);
          if (!text) break;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "user" && last.content === text) return prev;
            return [
              ...prev,
              { id: `steer_${evt.run_id}:${evt.seq}`, role: "user", content: text },
            ];
          });
          break;
        }
        // /stop was accepted but the agent shuts down cooperatively — the run
        // keeps streaming until it settles as cancelled.
        case "run.stopping": {
          setPhase("stopping");
          break;
        }
        case "subagent.start": {
          const id =
            str(evt.subagent_id) ?? str(evt.child_session_id) ?? `${evt.run_id}:${evt.seq}`;
          setSubagents((prev) =>
            prev.some((s) => s.id === id)
              ? prev
              : [
                  ...prev,
                  {
                    id,
                    goal: str(evt.goal) ?? str(evt.preview),
                    status: "running",
                    model: str(evt.model),
                    depth: num(evt.depth),
                    taskIndex: num(evt.task_index),
                    taskCount: num(evt.task_count),
                  },
                ],
          );
          break;
        }
        case "subagent.complete": {
          const id =
            str(evt.subagent_id) ?? str(evt.child_session_id) ?? `${evt.run_id}:${evt.seq}`;
          // `status` is the child's own word for how it ended; anything that
          // isn't a plain success is worth showing in red.
          const status = str(evt.status);
          const failed = status != null && !/^(ok|success|completed?)$/i.test(status);
          const patch: Partial<SubagentRun> = {
            status: failed ? "failed" : "completed",
            summary: str(evt.summary) ?? str(evt.output_tail) ?? str(evt.preview),
            durationSeconds: num(evt.duration_seconds),
            inputTokens: num(evt.input_tokens),
            outputTokens: num(evt.output_tokens),
            costUsd: num(evt.cost_usd),
            filesRead: num(evt.files_read),
            filesWritten: num(evt.files_written),
          };
          setSubagents((prev) => {
            const index = prev.findIndex((s) => s.id === id);
            // A complete with no matching start still deserves a row — the
            // start can be lost to a reconnect gap.
            if (index === -1) {
              return [...prev, { id, goal: str(evt.goal), ...patch } as SubagentRun];
            }
            const next = [...prev];
            next[index] = { ...next[index], ...patch };
            return next;
          });
          break;
        }
        case "error": {
          setError(str(evt.message) ?? str(evt.error) ?? "Run error");
          break;
        }
        case "run.completed":
        case "run.failed":
        case "run.cancelled":
        case "_local.closed": {
          // Keep the streamed text on screen as a real message until the
          // authoritative history lands, so the thread never blanks.
          const finalText = streamingRef.current;
          if (finalText.trim()) {
            setMessages((prev) => [
              ...prev,
              { id: `local_${Date.now()}`, role: "assistant", content: finalText },
            ]);
          }
          // run.failed carries the upstream reason in `error` — a provider
          // 429 or a bad model id reads as "Run failed" otherwise, and the
          // one thing the user can act on is exactly that string.
          if (kind === "run.failed") setError(str(evt.error) ?? "Run failed");
          if (kind === "run.cancelled") setError("Stopped");
          // The last segment was never followed by a tool call, so it was the
          // answer, not narration. Drop the boundary and leave the text alone.
          resetSegments();
          // The one moment worth a buzz: a long task landing while the phone
          // is in a pocket. No-op on iOS, which has no vibration API.
          if (prefs.haptics && kind === "run.completed") navigator.vibrate?.([8, 40, 8]);
          setPhase("idle");
          setStreaming("");
          streamingRef.current = "";
          setThinking("");
          setSubagents([]);
          setApproval(null);
          setStartedAt(null);
          void refreshMessages();
          break;
        }
        default:
          break;
      }
    },
    [refreshMessages, resetSegments, setError, prefs.haptics],
  );

  const { reconnect } = useRunStream(projectId, onEvent);

  const send = useCallback(
    async (
      text: string,
      attachments: Attachment[] = [],
      prefer?: "steer" | "queue",
    ) => {
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) return;
      setErrorMessage(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `local_${Date.now()}`,
          role: "user",
          content: trimmed,
          // Local to this turn: refreshMessages re-reads history from Hermes,
          // which returns text only, so the thumbnails go once the run settles
          // and the file paths in the prompt are what remains.
          attachments: attachments.length > 0 ? attachments : undefined,
        },
      ]);

      let res: Response;
      try {
        res = await fetch(`/api/projects/${projectId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, attachments, prefer }),
        });
      } catch {
        setError("Network unreachable");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Send failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as {
        queued: boolean;
        mode?: "started" | "steered" | "queued";
        runId: string;
      };
      if (body.mode === "steered") {
        // The text is already in the running turn's transcript, so the
        // optimistic user message above is the whole of the UI it needs — no
        // queued row, and no new run to bind the stream to.
        return;
      }
      if (body.queued) {
        setQueued((prev) => [
          ...prev,
          trimmed || attachments.map((a) => a.name).join(", "),
        ]);
        return;
      }
      startNewRun(body.runId);
      // The stream we're on resolved before this run existed; force a fresh
      // connection so it binds to the new run id.
      reconnect();
    },
    [projectId, reconnect, setError, startNewRun],
  );

  const stop = useCallback(async () => {
    if (!runIdRef.current) return;
    // run.stopping lands on the stream a moment later, but the button has to
    // stop looking pressable now.
    setPhase((current) => (current === "idle" ? current : "stopping"));
    await fetch(`/api/runs/${runIdRef.current}/stop`, { method: "POST" });
  }, []);

  const retry = useCallback(async () => {
    setErrorMessage(null);
    const res = await fetch(`/api/projects/${projectId}/retry`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Retry failed");
      return;
    }
    const body = (await res.json()) as { queued: boolean; runId: string };
    if (!body.queued) {
      startNewRun(body.runId);
      reconnect();
    }
  }, [projectId, reconnect, setError, startNewRun]);

  const respondApproval = useCallback(
    async (choice: string, all = false) => {
      if (!approval) return;
      const pending = approval;
      setApproval(null);
      setPhase("running");
      let res: Response;
      try {
        res = await fetch(`/api/runs/${pending.runId}/approval`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choice, all }),
        });
      } catch {
        setApproval(pending);
        setPhase("waiting_for_approval");
        setError("Network unreachable");
        return;
      }
      if (!res.ok) {
        // Put the card back. The run is still blocked upstream, and a thread
        // that looks like it resumed but hasn't is the worse failure.
        setApproval(pending);
        setPhase("waiting_for_approval");
        setError("Approval failed to reach Hermes");
      }
    },
    [approval, setError],
  );

  const state: ThreadState = {
    messages,
    streaming,
    thinking,
    tools,
    subagents,
    phase,
    approval,
    runId,
    startedAt,
    queued,
    error,
    errorSeq,
  };

  return {
    ...state,
    send,
    stop,
    retry,
    respondApproval,
    /** for the shell's own failures — a command that didn't land, say */
    raiseError: setError,
    dismissError: () => setErrorMessage(null),
  };
}
