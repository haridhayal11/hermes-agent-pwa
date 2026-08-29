"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useThread } from "@/hooks/useThread";
import {
  AssistantMessage,
  CronMessage,
  extractQuestion,
  SystemMessage,
  UserMessage,
} from "@/components/chat/Message";
import { RecommendationCard } from "@/components/chat/RecommendationCard";
import { ThinkingTrace } from "@/components/chat/ThinkingTrace";
import { ToolCallRows } from "@/components/chat/ToolCallRows";
import { SubagentCards } from "@/components/chat/SubagentCard";
import { ApprovalCard } from "@/components/chat/ApprovalCard";
import { QueuedRows } from "@/components/chat/QueuedRows";
import { RunStatusLine } from "@/components/chat/RunStatusLine";
import { Composer } from "@/components/chat/Composer";
import { ModelPicker } from "@/components/chat/ModelPicker";
import {
  effortOf,
  withEffort,
  type ModelOptions,
  type ModelSelection,
  type ReasoningEffort,
} from "@/lib/model-options";
import { ToolsetsSheet } from "@/components/chat/ToolsetsSheet";
import { ProjectSettingsSheet } from "@/components/nav/ProjectSettings";
import { Toast } from "@/components/ui/Toast";
import { useRunStatus } from "@/components/chat/RunStatusContext";
import { useAppActions } from "@/components/AppActionsContext";
import { usePreferences } from "@/components/PreferencesContext";
import { useStatus } from "@/hooks/useStatus";
import { useModels } from "@/hooks/useModels";
import { IconChevronDown, IconRetry } from "@/components/primitives/icons";
import type { SlashCommand } from "@/lib/commands";
import type {
  Attachment,
  Project,
  ProjectSession,
  ThreadMessage,
} from "@/lib/chat-types";

/** The column is JSON; a corrupt value must not take the thread down with it. */
function parseModelOptions(raw: string | null): ModelOptions {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ModelOptions;
  } catch {
    return {};
  }
}

export function ChatThread({
  project,
  session,
  initialMessages,
}: {
  project: Project;
  session: ProjectSession;
  initialMessages: ThreadMessage[];
}) {
  const projectId = project.id;
  const scheduled = session.kind === "scheduled";
  const thread = useThread(projectId, session.session_id, initialMessages);
  const {
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
    raiseError,
    stop,
    retry,
  } = thread;

  const router = useRouter();
  const { openSearch } = useAppActions();
  const { features } = useStatus();
  /* Shared with the picker so the inventory is fetched once. Its `current` is
   * the only honest source for the gateway's model — /v1/capabilities reports
   * the virtual "hermes-agent" alias, which is not a model anyone selected. */
  const { payload: models, refreshing, refresh } = useModels();
  const gatewayModel = models?.current.model ?? null;
  const { prefs, reduceMotion } = usePreferences();

  const [modelOpen, setModelOpen] = useState(false);
  const [toolsetsOpen, setToolsetsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduledSending, setScheduledSending] = useState(false);
  const readThroughRef = useRef<string | null>(null);
  // Optimistic: the picker has to feel instant, and the row is written behind
  // it. A failed PATCH is reported by the toast, not by a reverting chip.
  const [selection, setSelection] = useState<ModelSelection>({
    model: project.model,
    provider: project.provider,
    modelOptions: parseModelOptions(project.model_options),
  });

  // the header's status dot lives above this component in the tree
  const { setPhase } = useRunStatus();
  useEffect(() => {
    setPhase(phase);
  }, [phase, setPhase]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  // mirrored into state purely to drive the jump-to-latest button; the ref is
  // what the scroll effect reads, so the render is never in the hot path
  const [pinned, setPinned] = useState(true);

  // Only auto-scroll when the reader is already at the bottom — yanking the
  // viewport while they're reading back through the thread is worse than a
  // missed token.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    pinnedRef.current = atBottom;
    setPinned(atBottom);
  }, []);

  const scrollBehavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";

  const jumpToLatest = useCallback(() => {
    pinnedRef.current = true;
    setPinned(true);
    bottomRef.current?.scrollIntoView({ behavior: scrollBehavior, block: "end" });
  }, [scrollBehavior]);

  useEffect(() => {
    // "Follow the reply" off means the view only moves when you move it — the
    // jump-to-latest button below is then the only way back to live.
    if (!prefs.autoScroll) return;
    if (!pinnedRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: scrollBehavior, block: "end" });
  }, [
    messages,
    streaming,
    thinking,
    tools.length,
    approval,
    queued.length,
    prefs.autoScroll,
    scrollBehavior,
  ]);

  const running = phase !== "idle";
  const stopping = phase === "stopping";
  const latestScheduled = messages.findLast((message) => message.role === "cron");

  const markScheduledRead = useCallback(async () => {
    if (!scheduled || document.visibilityState !== "visible") return;
    const deliveryId = latestScheduled?.id ?? null;
    if (readThroughRef.current === deliveryId) return;
    const response = await fetch(`/api/projects/${projectId}/scheduled/read`, {
      method: "POST",
    });
    if (!response.ok) return;
    readThroughRef.current = deliveryId;
    router.refresh();
  }, [latestScheduled?.id, projectId, router, scheduled]);

  useEffect(() => {
    if (!scheduled) return;
    void markScheduledRead();
    const onVisibility = () => void markScheduledRead();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [markScheduledRead, scheduled]);

  const replyToScheduled = useCallback(
    async (text: string, attachments: Attachment[]) => {
      if (!latestScheduled || scheduledSending) return;
      setScheduledSending(true);
      try {
        const response = await fetch(`/api/projects/${projectId}/scheduled/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deliveryId: latestScheduled.id,
            text,
            attachments,
          }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          session?: { id: string };
        };
        if (body.session?.id) {
          router.push(`/p/${projectId}/s/${body.session.id}`);
          return;
        }
        raiseError(body.error ?? "Could not start the discussion");
      } catch {
        raiseError("Network unreachable");
      } finally {
        setScheduledSending(false);
      }
    },
    [latestScheduled, projectId, raiseError, router, scheduledSending],
  );

  /* The chip drives model_options.reasoning on the run, so it is scoped to
   * whatever will actually run — the pinned model, else the gateway's own.
   * `undefined` hides it: a model advertising no reasoning has nothing to set,
   * and so does an inventory that hasn't arrived yet. */
  const effectiveModel = selection.model ?? gatewayModel;
  /* Default to offering the control. The inventory takes a moment to arrive —
   * Hermes enriches it with pricing — and it may never arrive at all if the
   * gateway is down, but the run would still honour the option. Hiding it
   * would mean the chips blink into existence seconds after the composer, or
   * never. Only a model that explicitly says it has no reasoning loses it. */
  const supportsReasoning =
    models?.providers
      .flatMap((p) => p.models)
      .find((m) => m.id === effectiveModel)?.reasoning ?? true;

  const chooseModel = useCallback(
    async (next: ModelSelection) => {
      setSelection(next);
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: next.model,
          provider: next.provider,
          model_options: next.modelOptions,
        }),
      });
      if (!res.ok) raiseError("Could not save the model choice");
    },
    [projectId, raiseError],
  );

  const setThinking = useCallback(
    (next: ReasoningEffort | null) =>
      void chooseModel({
        ...selection,
        modelOptions: withEffort(selection.modelOptions, next),
      }),
    [chooseModel, selection],
  );

  /* `/` commands. Hermes routes none of these over :8642, so each one maps to
   * an endpoint this app already owns — see lib/commands.ts for why the ones
   * it can't reach are still listed. */
  const onCommand = useCallback(
    async (command: SlashCommand, rest: string) => {
      switch (command.id) {
        case "model":
          setModelOpen(true);
          return;
        case "toolsets":
          setToolsetsOpen(true);
          return;
        case "skills":
          // Skills are linked per project, and project settings is where that
          // list lives.
          setSettingsOpen(true);
          return;
        case "search":
          openSearch();
          return;
        case "status":
          router.push("/settings");
          return;
        case "stop":
          await stop();
          return;
        case "retry":
          await retry();
          return;
        case "new": {
          const res = await fetch(`/api/projects/${projectId}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: rest || "New chat" }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            raiseError(body.error ?? "Could not start a new session");
            return;
          }
          const body = (await res.json()) as { session: { id: string } };
          router.push(`/p/${projectId}/s/${body.session.id}`);
          return;
        }
        case "title": {
          if (!rest) return;
          const res = await fetch(`/api/projects/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: rest }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            raiseError(body.error ?? "Could not rename");
            return;
          }
          router.refresh();
          return;
        }
        case "branch": {
          const res = await fetch(
            `/api/projects/${projectId}/sessions/${session.session_id}/fork`,
            {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: rest || undefined }),
            },
          );
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            raiseError(body.error ?? "Could not branch this project");
            return;
          }
          const body = (await res.json()) as { session: { id: string } };
          router.push(`/p/${projectId}/s/${body.session.id}`);
          return;
        }
        // steer and queue never reach here — the composer turns them straight
        // back into a send with the branch forced.
        case "steer":
        case "queue":
          return;
      }
    },
    [openSearch, projectId, raiseError, retry, router, session.session_id, stop],
  );

  // Tool calls happen *before* the reply they produce, but the reply only
  // joins `messages` once the run settles — so left alone the activity block
  // renders underneath the answer it led to, below even the Retry button.
  // Split the transcript one message early in that case and thread the
  // activity through the gap.
  const settled = !running && tools.length > 0;
  const splitAt =
    settled && messages[messages.length - 1]?.role === "assistant"
      ? messages.length - 1
      : messages.length;

  /* The decision the thread is blocked on, pinned above the composer rather
   * than left in the transcript. An approval and an answerable question are
   * the same thing from the reader's side — the run has stopped and is
   * waiting on you — and both were previously buried behind whatever the
   * agent wrote last, with the Retry row sitting between them and the input.
   * An approval outranks a question: it's a live run holding a lock. */
  const lastMessage = messages[messages.length - 1];
  const pinnedQuestion =
    !approval && !running && lastMessage?.role === "assistant"
      ? extractQuestion(lastMessage.content)
      : null;

  const statusLabel =
    phase === "waiting_for_approval"
      ? "Waiting for approval"
      : stopping
        ? "Stopping"
        : subagents.some((s) => s.status === "running")
          ? "Delegating"
          : tools.some((t) => t.status === "running")
            ? "Running tools"
            : "Working";

  const renderMessages = (slice: ThreadMessage[], offset: number) =>
    slice.map((message, i) => {
      const isLast = offset + i === messages.length - 1;
      return message.role === "user" ? (
        <UserMessage
          key={message.id}
          content={message.content}
          attachments={message.attachments}
        />
      ) : message.role === "system" ? (
        <SystemMessage key={message.id} content={message.content} />
      ) : message.role === "cron" && message.cron ? (
        <CronMessage
          key={message.id}
          content={message.content}
          meta={message.cron}
          markdown={message.contentFormat === "markdown"}
        />
      ) : (
        <AssistantMessage
          key={message.id}
          content={message.content}
          markdown={message.contentFormat === "markdown"}
          // A recommendation is a question about what to do next, so only the
          // newest one is still answerable; older cards render inert.
          onRecommendationAction={
            isLast && !running ? (reply) => void thread.send(reply) : undefined
          }
          hoistQuestions={isLast && pinnedQuestion !== null}
          // the last settled turn carries the retry affordance — steering only
          // works mid-run, so re-running is the redo once it's over. Not while
          // a question is pinned: answering it is the action, and a Retry row
          // between the card and the composer is exactly the gap that made
          // the decision feel unmoored from the input.
          footer={
            !running && isLast && !pinnedQuestion ? (
              <button
                type="button"
                onClick={retry}
                className="-mx-1.5 mt-1 flex h-7 w-fit items-center gap-1.5 rounded-chip px-1.5
                  text-label font-medium text-ink-3 transition-colors duration-100
                  hover:bg-hover-2 hover:text-ink-2 active:scale-[0.97]"
              >
                <IconRetry size={13} />
                Retry
              </button>
            ) : null
          }
        />
      );
    });

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        // data-selectable: the shell suppresses long-press selection so taps
        // feel native, and the transcript is the one place that opts back in
        data-selectable
        className="scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="px-safe mx-auto flex w-full max-w-3xl flex-col gap-5 pt-4 pb-2">
          {messages.length === 0 && !running && (
            <p className="py-10 text-center text-label text-ink-3">
              {scheduled
                ? "Scheduled reports for this project will appear here."
                : "Nothing here yet. This thread stays put — come back to it whenever."}
            </p>
          )}

          {renderMessages(messages.slice(0, splitAt), 0)}

          {(thinking || tools.length > 0 || subagents.length > 0 || streaming || running) && (
            <div className="flex w-full flex-col gap-2.5">
              <ThinkingTrace text={thinking} working={running && !streaming} />
              {/* Delegated work above the parent's own tool calls: a subagent
                * is the reason the parent went quiet, and its accounting is
                * the part worth seeing on a phone. */}
              <SubagentCards subagents={subagents} />
              {/* keyed on the run: the disclosure preference sets the opening
                * state, and a stray tap during one run must not carry into
                * the next. */}
              <ToolCallRows key={runId ?? "idle"} tools={tools} />
              {streaming && (
                <AssistantMessage
                  content={streaming}
                  streaming
                  markdown
                  // written, but not yet acted on — the run is blocked on a
                  // decision, so the text reads as provisional
                  resolving={phase === "waiting_for_approval"}
                />
              )}
              {running && !streaming && (
                <RunStatusLine label={statusLabel} startedAt={startedAt} />
              )}
            </div>
          )}

          {renderMessages(messages.slice(splitAt), splitAt)}

          <QueuedRows queued={queued} />

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Jump-to-latest — without it, scrolling up during a long run strands
       * the reader: the thread keeps growing and there is no way back to live
       * except flicking past everything that arrived in the meantime. */}
      <div className="px-safe pointer-events-none relative z-20 mx-auto w-full max-w-3xl">
        <button
          type="button"
          aria-label="Jump to latest"
          aria-hidden={pinned}
          tabIndex={pinned ? -1 : 0}
          onClick={jumpToLatest}
          className={`absolute right-0 bottom-2 flex size-9 items-center justify-center
            rounded-full bg-surface text-ink-2 shadow-raised transition-[opacity,transform]
            duration-200 active:scale-[0.94] ${
              pinned
                ? "pointer-events-none translate-y-1 opacity-0"
                : "pointer-events-auto translate-y-0 opacity-100"
            }`}
        >
          <IconChevronDown size={16} />
        </button>
      </div>

      {error && (
        <div className="px-safe pointer-events-none z-30 mx-auto w-full max-w-3xl pb-1">
          <Toast
            message={error}
            tone={error === "Stopped" ? "neutral" : "error"}
            action={phase === "idle" ? { label: "Retry", onClick: retry } : undefined}
            onDismiss={thread.dismissError}
          />
        </div>
      )}

      {/* The decision box, directly above the input it interrupts. Capped at
        * 45vh and scrollable in its own right: an approval's command block
        * can run to dozens of lines, and pushing the composer off a 390px
        * screen would leave no way to answer in prose either. */}
      {(approval || pinnedQuestion) && (
        <div className="px-safe z-20 mx-auto w-full max-w-3xl shrink-0 pb-1">
          {/* the 2px inset keeps overflow-y-auto from shearing the card's
            * shadow off at the scroll box edge */}
          <div className="scroll-area max-h-[45dvh] overflow-y-auto overscroll-contain p-0.5">
            {approval ? (
              <ApprovalCard
                approval={approval}
                onRespond={(choice, all) => void thread.respondApproval(choice, all)}
              />
            ) : (
              pinnedQuestion && (
                <RecommendationCard
                  recommendation={pinnedQuestion}
                  onAction={(reply) => void thread.send(reply)}
                />
              )
            )}
          </div>
        </div>
      )}

      <Composer
        projectId={projectId}
        onSend={scheduled ? replyToScheduled : thread.send}
        onStop={stop}
        onCommand={(command, rest) => void onCommand(command, rest)}
        onUnavailable={raiseError}
        running={scheduled ? false : running}
        stopping={stopping}
        features={features}
        /* "default" while the inventory is still in flight, rather than no
         * chip at all — otherwise the only way into the picker appears late,
         * or never if Hermes is unreachable. */
        modelLabel={
          scheduled ? null : effectiveModel ?? (features.model_options ? "default" : null)
        }
        onPickModel={
          !scheduled && features.model_options ? () => setModelOpen(true) : undefined
        }
        thinkingEffort={
          !scheduled && supportsReasoning ? effortOf(selection.modelOptions) : undefined
        }
        onThinkingChange={scheduled ? undefined : setThinking}
        errorNonce={errorSeq}
        disabled={scheduled && (!latestScheduled || scheduledSending)}
        placeholder={
          scheduled
            ? latestScheduled
              ? "Reply to latest report"
              : "Waiting for the first scheduled report…"
            : undefined
        }
        commandsEnabled={!scheduled}
      />

      <ModelPicker
        open={modelOpen}
        onClose={() => setModelOpen(false)}
        selection={selection}
        onSelect={(next) => void chooseModel(next)}
        payload={models}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      />
      <ToolsetsSheet open={toolsetsOpen} onClose={() => setToolsetsOpen(false)} />
      {!scheduled && (
        <ProjectSettingsSheet
          project={project}
          sessionId={session.session_id}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}
