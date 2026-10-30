"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useThread } from "@/hooks/useThread";
import {
  AssistantMessage,
  CommandMessage,
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
import { ClarifyCard } from "@/components/chat/ClarifyCard";
import { buttonClass } from "@/components/ui/SettingsControls";
import { QueuedRows } from "@/components/chat/QueuedRows";
import { RunStatusLine } from "@/components/chat/RunStatusLine";
import {
  DaySeparator,
  MessageActions,
  startsNewDay,
  useHydrated,
} from "@/components/chat/MessageActions";
import { useShortcuts } from "@/hooks/useShortcuts";
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
import { JobSheet, type JobDraft } from "@/components/settings/JobSheet";
import { exportThread } from "@/lib/export-thread";
import { parseExportFormat } from "@/lib/transcript-export";
import { Toast } from "@/components/ui/Toast";
import { useRunStatus } from "@/components/chat/RunStatusContext";
import { useAppActions } from "@/components/AppActionsContext";
import { useActivity } from "@/components/ActivityContext";
import { usePreferences } from "@/components/PreferencesContext";
import { useStatus } from "@/hooks/useStatus";
import { useModels } from "@/hooks/useModels";
import { ProjectBotProvider } from "@/components/ProjectBotContext";
import { IconChevronDown } from "@/components/primitives/icons";
import type { SlashCommand } from "@/lib/commands";
import type {
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

type ChatThreadProps = {
  project: Project;
  session: ProjectSession;
  initialMessages: ThreadMessage[];
};

/** A Bot's project reads its catalogues from, and speaks as, that Bot. */
export function ChatThread(props: ChatThreadProps) {
  return (
    <ProjectBotProvider profile={props.project.profile} name={props.project.bot_name}>
      <ChatThreadBody {...props} />
    </ProjectBotProvider>
  );
}

function ChatThreadBody({ project, session, initialMessages }: ChatThreadProps) {
  const projectId = project.id;
  /* General is where scheduled jobs report. It is an ordinary chat — reply
   * in place — with two differences: it marks its reports read while you are
   * looking at it, and it never grows a second chat. */
  const general = project.scheduled_session_id === session.session_id;
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
  const { openSearch, openPanel } = useAppActions();
  const { features, version } = useStatus();
  /* Shared with the picker so the inventory is fetched once. Its `current` is
   * the only honest source for the gateway's model — /v1/capabilities reports
   * the virtual "hermes-agent" alias, which is not a model anyone selected. */
  const { payload: models, refreshing, refresh } = useModels(project.profile ?? null);
  const gatewayModel = models?.current.model ?? null;
  const { prefs, reduceMotion } = usePreferences();

  const [modelOpen, setModelOpen] = useState(false);
  const [toolsetsOpen, setToolsetsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** "Repeat this…": the prompt a new scheduled job starts from */
  const [jobDraft, setJobDraft] = useState<JobDraft | null>(null);
  /** text pushed into the composer — "edit and resend", or a starter prompt */
  const [seed, setSeed] = useState<{ text: string; nonce: number }>();
  const seedComposer = useCallback(
    (text: string) => setSeed((current) => ({ text, nonce: (current?.nonce ?? 0) + 1 })),
    [],
  );
  const hydrated = useHydrated();
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
  /* What the thread looked like when the reader scrolled away, so the
   * jump-to-latest button can say whether anything has arrived since. */
  const contentSignature = `${messages.length}:${streaming.length}:${tools.length}:${queued.length}`;
  const signatureRef = useRef(contentSignature);
  useEffect(() => {
    signatureRef.current = contentSignature;
  });
  const [leftAt, setLeftAt] = useState(contentSignature);
  const unseen = !pinned && leftAt !== contentSignature;

  // Only auto-scroll when the reader is already at the bottom — yanking the
  // viewport while they're reading back through the thread is worse than a
  // missed token.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (pinnedRef.current && !atBottom) setLeftAt(signatureRef.current);
    pinnedRef.current = atBottom;
    setPinned(atBottom);
  }, []);

  const scrollBehavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";

  const jumpToLatest = useCallback(() => {
    pinnedRef.current = true;
    setPinned(true);
    bottomRef.current?.scrollIntoView({ behavior: scrollBehavior, block: "end" });
  }, [scrollBehavior]);

  /* Open at the newest message, instantly — and again once day separators
   * and times appear after hydration, which grows the thread under a reader
   * who hasn't moved. A smooth scroll here would animate past the whole
   * history on every visit. */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [hydrated]);

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

  useShortcuts([
    { key: ".", mod: true, when: running && !stopping, run: () => void stop() },
  ]);

  // Oldest first, for the composer's ↑ recall.
  const promptHistory = useMemo(
    () => messages.filter((m) => m.role === "user" && m.content.trim()).map((m) => m.content),
    [messages],
  );
  const lastUserIndex = messages.findLastIndex((m) => m.role === "user");

  /* Which messages open a new calendar day. Client-only: "today" depends on
   * the reader's timezone, which the server render can't know. */
  const newDayIds = useMemo(() => {
    const ids = new Set<string>();
    if (!hydrated) return ids;
    let previous: number | undefined;
    for (const message of messages) {
      if (!message.createdAt) continue;
      if (startsNewDay(message.createdAt, previous)) ids.add(message.id);
      previous = message.createdAt;
    }
    return ids;
  }, [hydrated, messages]);
  const latestScheduled = messages.findLast((message) => message.role === "cron");

  const markScheduledRead = useCallback(async () => {
    if (!general || document.visibilityState !== "visible") return;
    const deliveryId = latestScheduled?.id ?? null;
    if (readThroughRef.current === deliveryId) return;
    const response = await fetch(`/api/projects/${projectId}/scheduled/read`, {
      method: "POST",
    });
    if (!response.ok) return;
    readThroughRef.current = deliveryId;
    router.refresh();
  }, [general, latestScheduled?.id, projectId, router]);

  useEffect(() => {
    if (!general) return;
    void markScheduledRead();
    const onVisibility = () => void markScheduledRead();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [general, markScheduledRead]);

  /* A finished reply nobody has opened is what Home and the app badge count.
   * This chat is open, so it marks itself seen: on arrival, on coming back to
   * the foreground, and the moment a run watched here ends. Visibility is the
   * test, not an attached stream — iOS keeps that open behind the lock screen. */
  const { refresh: refreshActivity } = useActivity();
  const markSeen = useCallback(
    async (watchedRunId?: string) => {
      if (document.visibilityState !== "visible") return;
      const response = await fetch(
        `/api/projects/${projectId}/sessions/${session.session_id}/seen`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(watchedRunId ? { runId: watchedRunId } : {}),
        },
      ).catch(() => null);
      if (response?.ok) refreshActivity();
    },
    [projectId, session.session_id, refreshActivity],
  );

  useEffect(() => {
    void markSeen();
    const onVisibility = () => void markSeen();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [markSeen]);

  /* A transient, neutral line — an answer to a command, or news that a link
   * was stale. Errors keep their own toast, which outranks this one. */
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  /* An approval's notification opens this chat with ?approval=<run id>. If
   * the card is here, it takes focus; if activity already says that run is
   * not waiting, it was answered somewhere else and the reader is told so
   * rather than left looking for a card that will never come. Either way the
   * parameter goes, so a reload doesn't repeat it. */
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const approvalTarget = searchParams.get("approval");
  const { activity } = useActivity();
  // The history API, not router.replace: the latter re-renders the server
  // page, which refetches the whole transcript to drop a query string.
  const clearApprovalTarget = useCallback(() => {
    window.history.replaceState(window.history.state, "", pathname);
  }, [pathname]);
  const attention = Boolean(approvalTarget && approval?.runId === approvalTarget);
  const stillWaiting = Boolean(
    activity?.feed.some((item) => item.kind === "approval" && item.runId === approvalTarget),
  );
  const staleApproval = Boolean(approvalTarget && !attention && activity && !stillWaiting);
  useEffect(() => {
    if (!staleApproval) return;
    const timer = setTimeout(clearApprovalTarget, 4000);
    return () => clearTimeout(timer);
  }, [staleApproval, clearApprovalTarget]);
  const shownNotice =
    notice ?? (staleApproval ? "That approval was already answered" : null);

  const previousPhase = useRef(phase);
  useEffect(() => {
    const was = previousPhase.current;
    previousPhase.current = phase;
    if (was !== "idle" && phase === "idle" && runId) void markSeen(runId);
  }, [phase, runId, markSeen]);

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
        case "approve":
        case "deny": {
          if (!approval) {
            raiseError("Nothing is waiting for approval");
            return;
          }
          const word = rest.split(/\s+/)[0]?.toLowerCase() ?? "";
          const choice =
            command.id === "deny" ? "deny" : word === "" ? "once" : word;
          // The card's own fallback when the event names no choices.
          const offered = approval.choices.length > 0 ? approval.choices : ["once", "deny"];
          if (!offered.includes(choice)) {
            raiseError(
              command.id === "approve" && !["once", "session", "always"].includes(choice)
                ? "Use /approve, /approve session or /approve always"
                : `This approval doesn't offer “${choice}”`,
            );
            return;
          }
          await thread.respondApproval(choice, command.id === "deny" && word === "all");
          return;
        }
        case "version":
          setNotice(version ? `Hermes ${version}` : "This gateway doesn't report its version");
          return;
        case "save": {
          const format = parseExportFormat(rest);
          if (!format) {
            raiseError("Use /save md or /save json");
            return;
          }
          const failure = await exportThread(projectId, session.session_id, format);
          if (failure) raiseError(failure);
          return;
        }
        case "sessions":
        case "resume":
          if (general) {
            raiseError("General keeps a single chat");
            return;
          }
          openPanel(
            command.id === "resume" && rest
              ? { kind: "import", query: rest, resume: true }
              : { kind: "import" },
          );
          return;
        case "diff":
          if (!project.cwd) {
            raiseError("This project has no working directory — set one in Edit project");
            return;
          }
          openPanel({ kind: "diff" });
          return;
        // steer and queue never reach here — the composer turns them straight
        // back into a send with the branch forced.
        case "steer":
        case "queue":
          return;
      }
    },
    [
      openSearch,
      openPanel,
      projectId,
      raiseError,
      retry,
      router,
      session.session_id,
      stop,
      approval,
      thread,
      version,
      general,
      project.cwd,
    ],
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
  // A scheduled report can end on a decision too — the brief asking which
  // card to use — and in General that is most of what needs answering.
  const pinnedQuestion =
    !approval &&
    !running &&
    (lastMessage?.role === "assistant" || lastMessage?.role === "cron")
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

  /* "Repeat this…" makes a scheduled job of a prompt. Only on the default
   * profile: the cron watcher reads that profile's jobs and no other, so a
   * Bot's job would fire and never reach this app. The job is its own
   * session — the project's instructions don't travel with it — so the
   * working directory, which the prompt most often depends on, is written in. */
  const canRepeat = !project.profile;
  const commandContext = useMemo(
    () => ({ approval: approval !== null, cwd: Boolean(project.cwd) }),
    [approval, project.cwd],
  );
  const repeatPrompt = (content: string) => {
    const firstLine = content.trim().split("\n")[0] ?? "";
    setJobDraft({
      name: firstLine.length > 48 ? `${firstLine.slice(0, 47).trimEnd()}…` : firstLine,
      prompt: project.cwd ? `Working directory: ${project.cwd}\n\n${content.trim()}` : content.trim(),
      origin:
        "Runs on its own schedule, without this project's instructions, and reports into General.",
    });
  };

  const renderMessage = (message: ThreadMessage, index: number) => {
    const isLast = index === messages.length - 1;
    if (message.role === "user") {
      return (
        <UserMessage
          key={message.id}
          content={message.content}
          attachments={message.attachments}
          footer={
            <MessageActions
              content={message.content}
              createdAt={message.createdAt}
              align="end"
              // Hermes has no edit endpoint, so this starts a new prompt from
              // the old one rather than rewriting history.
              onEdit={
                index === lastUserIndex ? () => seedComposer(message.content) : undefined
              }
              onRepeat={canRepeat ? () => repeatPrompt(message.content) : undefined}
            />
          }
        />
      );
    }
    if (message.role === "system" && message.command) {
      return <CommandMessage key={message.id} command={message.command} content={message.content} />;
    }
    if (message.role === "system") {
      return <SystemMessage key={message.id} content={message.content} />;
    }
    if (message.role === "cron" && message.cron) {
      return (
        <CronMessage
          key={message.id}
          content={message.content}
          meta={message.cron}
          markdown={message.contentFormat === "markdown"}
          hoistQuestions={isLast && pinnedQuestion !== null}
          onRecommendationAction={
            !running && isLast ? (reply) => void thread.send(reply) : undefined
          }
          footer={<MessageActions content={message.content} createdAt={message.createdAt} />}
        />
      );
    }
    const settledLast = !running && isLast;
    return (
      <AssistantMessage
        key={message.id}
        content={message.content}
        markdown={message.contentFormat === "markdown"}
        // A recommendation is a question about what to do next, so only the
        // newest one is still answerable; older cards render inert.
        onRecommendationAction={
          settledLast ? (reply) => void thread.send(reply) : undefined
        }
        hoistQuestions={isLast && pinnedQuestion !== null}
        footer={
          <MessageActions
            content={message.content}
            createdAt={message.createdAt}
            persistent={settledLast}
            // the last settled turn carries the retry affordance — steering
            // only works mid-run, so re-running is the redo once it's over.
            // Not while a question is pinned: answering it is the action, and
            // a Retry row between the card and the composer is exactly the
            // gap that made the decision feel unmoored from the input.
            onRetry={settledLast && !pinnedQuestion ? retry : undefined}
          />
        }
      />
    );
  };

  const renderMessages = (slice: ThreadMessage[], offset: number) =>
    slice.flatMap((message, i) => {
      const node = renderMessage(message, offset + i);
      return newDayIds.has(message.id) && message.createdAt
        ? [<DaySeparator key={`day-${message.id}`} ts={message.createdAt} />, node]
        : [node];
    });

  // Something to tap instead of a blank page. These fill the composer rather
  // than send — a starter is a suggestion, not a commitment to spend a turn.
  const starters = [
    `Let's pick up ${project.name}. What do you need from me?`,
    "What can you do in this project?",
    "Help me plan the next step.",
  ];

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
        <div className="px-safe mx-auto flex w-full max-w-3xl flex-col gap-7 pt-5 pb-6 sm:gap-9">
          {messages.length === 0 && !running && (
            <div
              className="flex flex-col items-center gap-5 py-16 text-center"
              style={{ animation: "fade-up var(--duration-slow) var(--ease-out-strong) both" }}
            >
              <p className="max-w-xs text-ui text-balance text-ink-2">
                {general
                  ? "Scheduled jobs report here. Reply to any of them right in this chat."
                  : "Nothing here yet. This thread stays put — come back to it whenever."}
              </p>
              {!general && (
                <div className="flex w-full max-w-sm flex-col gap-2">
                  {starters.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => seedComposer(starter)}
                      className="rounded-card px-4 py-3 text-left text-ui text-ink-2 shadow-card
                        transition-[color,background-color,transform] duration-150 hover:bg-hover
                        hover:text-ink active:scale-[0.98]"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {renderMessages(messages.slice(0, splitAt), 0)}

          {(thinking || tools.length > 0 || subagents.length > 0 || streaming || running) && (
            <div className="flex w-full flex-col gap-3">
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
          aria-label={unseen ? "Jump to latest — new activity" : "Jump to latest"}
          aria-hidden={pinned}
          tabIndex={pinned ? -1 : 0}
          onClick={jumpToLatest}
          className={`absolute inset-x-0 bottom-3 mx-auto flex size-9 items-center justify-center
            rounded-full border border-line-strong bg-surface text-ink shadow-raised transition-[opacity,transform]
            duration-200 ease-[var(--ease-out-strong)] active:scale-[0.94] ${
              pinned
                ? "pointer-events-none translate-y-1 opacity-0"
                : "pointer-events-auto translate-y-0 opacity-100"
            }`}
        >
          <IconChevronDown size={16} />
          {/* something arrived while the reader was scrolled away */}
          {unseen && (
            <span
              aria-hidden
              className="absolute top-1 right-1 size-2 rounded-full bg-ink ring-2 ring-surface"
              style={{ animation: "pop-in var(--duration-fast) var(--ease-out-strong) both" }}
            />
          )}
        </button>
      </div>

      {error ? (
        <div className="px-safe pointer-events-none z-30 mx-auto w-full max-w-3xl pb-1">
          <Toast
            message={error}
            tone={error === "Stopped" ? "neutral" : "error"}
            action={phase === "idle" ? { label: "Retry", onClick: retry } : undefined}
            onDismiss={thread.dismissError}
          />
        </div>
      ) : (
        shownNotice && (
          <div className="px-safe pointer-events-none z-30 mx-auto w-full max-w-3xl pb-1">
            <Toast
              message={shownNotice}
              onDismiss={() => {
                setNotice(null);
                if (staleApproval) clearApprovalTarget();
              }}
            />
          </div>
        )
      )}

      {/* The decision box, directly above the input it interrupts. Capped at
        * 45vh and scrollable in its own right: an approval's command block
        * can run to dozens of lines, and pushing the composer off a 390px
        * screen would leave no way to answer in prose either. */}
      {thread.unknownRun && !approval && !thread.clarify && (
        <div className="px-safe z-20 mx-auto w-full max-w-3xl shrink-0 pb-1">
          <div className="flex items-center gap-3 rounded-card bg-surface p-3 pl-4 shadow-card">
            <p className="min-w-0 flex-1 text-label text-ink-2">
              Hermes lost track of the last run. New messages here wait behind it until it&rsquo;s resolved.
            </p>
            <button
              type="button"
              onClick={() => void thread.resolveUnknown()}
              className={`${buttonClass("secondary", "sm")} h-8 shrink-0 px-3 text-label`}
            >
              Resolve
            </button>
          </div>
        </div>
      )}

      {(approval || thread.clarify || pinnedQuestion) && (
        // Selectable like the transcript: this sits outside the scroller,
        // and the approval's command is exactly what you'd want to copy.
        <div data-selectable className="px-safe z-20 mx-auto w-full max-w-3xl shrink-0 pb-1">
          {/* the 2px inset keeps overflow-y-auto from shearing the card's
            * shadow off at the scroll box edge */}
          <div className="scroll-area max-h-[45dvh] overflow-y-auto overscroll-contain p-0.5">
            {approval ? (
              <ApprovalCard
                approval={approval}
                onRespond={(choice, all) => void thread.respondApproval(choice, all)}
                attention={attention}
                onAttended={clearApprovalTarget}
              />
            ) : thread.clarify ? (
              <ClarifyCard
                clarify={thread.clarify}
                onAnswer={(answer) => void thread.respondClarify(answer)}
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
        draftId={session.session_id}
        history={promptHistory}
        seed={seed}
        onSend={thread.send}
        onStop={stop}
        onCommand={(command, rest) => void onCommand(command, rest)}
        onGatewayCommand={(text) => void thread.runGatewayCommand(text)}
        onUnavailable={raiseError}
        running={running}
        stopping={stopping}
        features={features}
        /* "default" while the inventory is still in flight, rather than no
         * chip at all — otherwise the only way into the picker appears late,
         * or never if Hermes is unreachable. */
        modelLabel={effectiveModel ?? (features.model_options ? "default" : null)}
        onPickModel={features.model_options ? () => setModelOpen(true) : undefined}
        thinkingEffort={supportsReasoning ? effortOf(selection.modelOptions) : undefined}
        onThinkingChange={setThinking}
        errorNonce={errorSeq}
        commandContext={commandContext}
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
      <ProjectSettingsSheet
        project={project}
        sessionId={session.session_id}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <JobSheet
        initial={jobDraft ?? undefined}
        open={jobDraft !== null}
        onClose={() => setJobDraft(null)}
        onSaved={() => setNotice("Scheduled — reports will land in General")}
      />
    </>
  );
}
