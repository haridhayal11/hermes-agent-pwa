"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePreferences } from "@/components/PreferencesContext";
import { useAgentName } from "@/components/AgentNameContext";
import { downscaleImage } from "@/lib/downscale";
import { APP_SLUG } from "@/lib/branding";
import { useShortcuts } from "@/hooks/useShortcuts";
import {
  IconArrowUp,
  IconChip,
  IconCross,
  IconFile,
  IconPaperclip,
  IconStop,
} from "@/components/primitives/icons";
import {
  ComposerMenu,
  useMenuItems,
  type MenuMode,
} from "./ComposerMenu";
import {
  commandQuery,
  findCatalogued,
  mentionQuery,
  parseCommand,
  REASON_LABEL,
  type CommandNeed,
  type SlashCommand,
} from "@/lib/commands";
import { ThinkingChip } from "./ThinkingChip";
import type { ReasoningEffort } from "@/lib/model-options";
import type { HermesFeatures } from "@/hooks/useStatus";
import type { Attachment } from "@/lib/chat-types";

/* PromptBar's composer shell, minus everything that only existed for the
 * showcase: the `glimm` rainbow sweep canvas, the scripted `demo` walkthrough,
 * and the fake dictation equaliser. What's kept is the grid, the tactile send
 * button, the focus-within border treatment, and — driven by real catalogues
 * rather than the library's scripted ones — the @ and / menus.
 *
 * Mobile additions the library has none of: the text-input token (16px on
 * touch — anything smaller makes iOS Safari zoom the viewport on focus and it
 * never zooms back), an auto-growing textarea, safe-area padding, and 44px
 * hit areas on the controls. */

const MAX_ROWS_PX = 168;

// useLayoutEffect logs on the server; this component renders there.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* Drafts are per device, like every other preference — a half-written prompt
 * on the phone is not something the Mac should be finishing. Keyed by chat,
 * so switching chats doesn't carry text into the wrong one. */
function draftKey(projectId: string, sessionId: string) {
  return `${APP_SLUG}.draft.${projectId}.${sessionId}`;
}

function writeDraft(key: string, text: string) {
  try {
    if (text.trim()) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  } catch {
    // Private mode or a full quota: the draft just won't survive a reload.
  }
}

export function Composer({
  projectId,
  draftId,
  history = [],
  seed,
  onSend,
  onStop,
  onCommand,
  onUnavailable,
  running,
  stopping = false,
  disabled = false,
  modelLabel,
  onPickModel,
  thinkingEffort,
  onThinkingChange,
  features,
  errorNonce = 0,
  placeholder,
  commandsEnabled = true,
  commandContext,
}: {
  /** the upload route needs it to decide where a non-image file lands */
  projectId: string;
  /** keys the saved draft; omit to keep the draft in memory only */
  draftId?: string;
  /** earlier prompts in this chat, oldest first, for ↑ recall */
  history?: string[];
  /** replaces the draft whenever `nonce` changes — "edit" on a sent message */
  seed?: { text: string; nonce: number };
  onSend: (
    text: string,
    attachments: Attachment[],
    prefer?: "steer" | "queue",
  ) => void;
  onStop: () => void;
  /** a `/` command the thread has to carry out; `rest` is the rest of the line */
  onCommand: (command: SlashCommand, rest: string) => void;
  /** a real Hermes command that can't run here — say so instead of sending it */
  onUnavailable: (message: string) => void;
  running: boolean;
  /** /stop was accepted; the run is winding down and can't be stopped twice */
  stopping?: boolean;
  disabled?: boolean;
  modelLabel?: string | null;
  onPickModel?: () => void;
  /**
   * Current reasoning effort, or null for off. Pass `undefined` to hide the
   * chip entirely — a model that advertises no reasoning has nothing to set.
   */
  thinkingEffort?: string | null;
  onThinkingChange?: (next: ReasoningEffort | null) => void;
  /** what the connected Hermes admits to supporting — gates the / list */
  features: HermesFeatures;
  /** bump to shake the bar — a send that didn't land */
  errorNonce?: number;
  placeholder?: string;
  commandsEnabled?: boolean;
  /** what this chat has, for commands that only make sense with it — memoise */
  commandContext?: Partial<Record<CommandNeed, boolean>>;
}) {
  const { prefs } = usePreferences();
  const agentName = useAgentName();
  const [draft, setDraft] = useState("");
  /** index into `history` while ↑/↓ is browsing it, newest = length - 1 */
  const [recall, setRecall] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuMode | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const storageKey = draftId ? draftKey(projectId, draftId) : null;
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  // Restore before paint. The server can't see localStorage, so the first
  // render is always empty and the stored text is applied here.
  useIsomorphicLayoutEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        // the ref too, or an unmount flush before the next render would
        // write the empty first-render draft over the one just restored
        draftRef.current = stored;
        setDraft(stored);
      }
    } catch {
      // unreadable storage — start empty
    }
  }, [storageKey]);

  // Debounced while typing, and flushed when the page is hidden or the chat
  // unmounts: iOS can evict a backgrounded tab without another event.
  useEffect(() => {
    if (!storageKey) return;
    const timer = setTimeout(() => writeDraft(storageKey, draft), 300);
    return () => clearTimeout(timer);
  }, [draft, storageKey]);
  useEffect(() => {
    if (!storageKey) return;
    const flush = () => writeDraft(storageKey, draftRef.current);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [storageKey]);

  // A new seed replaces the draft. Adjusted during render rather than in an
  // effect, so the text and the caret land in the same frame.
  const [seenSeed, setSeenSeed] = useState(seed?.nonce ?? 0);
  if (seed && seed.nonce !== seenSeed) {
    setSeenSeed(seed.nonce);
    setDraft(seed.text);
    setRecall(null);
  }
  useEffect(() => {
    if (!seed?.nonce) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [seed?.nonce]);

  useShortcuts([{ key: "/", mod: true, run: () => inputRef.current?.focus() }]);

  const { items: menuItems } = useMenuItems(menu, features, running, commandContext);
  // Arrow keys skip the unrouted rows; they're listed, not offered.
  const firstSelectable = menuItems.findIndex((i) => !i.disabled);
  const menuOpen = menu !== null && menuItems.length > 0;
  // A photo with no caption is a real message; an empty box with nothing
  // attached is not.
  const canSend =
    (draft.trim().length > 0 || attachments.length > 0) &&
    uploading === 0 &&
    !disabled;

  /* `File[]` as well as `FileList`, because a pasted screenshot arrives as
   * DataTransferItems rather than as an input's file list. */
  async function attach(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading((n) => n + files.length);
    await Promise.all(
      Array.from(files).map(async (raw) => {
        try {
          const file = await downscaleImage(raw);
          const form = new FormData();
          form.append("file", file);
          form.append("projectId", projectId);
          const res = await fetch("/api/upload", { method: "POST", body: form });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error || `Upload failed (${res.status})`);
          }
          const uploaded = (await res.json()) as Attachment;
          setAttachments((current) => [...current, uploaded]);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : "Upload failed");
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  }

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`;
  }, [draft]);

  const clear = () => {
    setDraft("");
    setRecall(null);
    if (storageKey) writeDraft(storageKey, "");
    setAttachments([]);
    setUploadError(null);
    setMenu(null);
  };

  const send = () => {
    if (!canSend) return;
    if (prefs.haptics) navigator.vibrate?.(8);
    const text = draft.trim();

    /* A leading slash is one of three things. */
    const parsed = commandsEnabled ? parseCommand(text) : undefined;
    if (parsed && (!parsed.command.requires || features[parsed.command.requires])) {
      // 1. Ours to carry out.
      const { command, rest } = parsed;
      // /steer and /queue are the same send with the branch forced.
      if (command.id === "steer" || command.id === "queue") {
        if (!rest) return;
        onSend(rest, [], command.id);
      } else {
        onCommand(command, rest);
      }
      clear();
      return;
    }

    if (commandsEnabled && !parsed) {
      /* 2. A real Hermes command we can't run. Hermes routes none of them over
       * :8642, so sending it would spend a whole turn handing the model five
       * literal characters. Say so and keep the draft, rather than letting the
       * user discover it from a confused reply. */
      const word = /^\/([a-z_-]+)/i.exec(text)?.[1];
      const catalogued = word ? findCatalogued(word) : undefined;
      if (catalogued) {
        onUnavailable(
          `${catalogued.name} is a Hermes command (${REASON_LABEL[catalogued.reason]})${
            catalogued.note ? ` — ${catalogued.note}` : ""
          }`,
        );
        return;
      }
    }

    // 3. Anything else starting with a slash is just text; send it.

    onSend(text, attachments);
    clear();
  };

  /** Recompute which menu (if any) the caret is sitting in. */
  const syncMenu = (value: string, caret: number) => {
    const command = commandQuery(value, caret);
    if (command !== null) {
      setMenu({ kind: "command", query: command });
      setMenuIndex(0);
      return;
    }
    const mention = mentionQuery(value, caret);
    setMenu(mention ? { kind: "mention", ...mention } : null);
    setMenuIndex(0);
  };

  const applyMenuItem = (index: number) => {
    const item = menuItems[index];
    if (!item || item.disabled || !menu) return;
    const el = inputRef.current;

    if (menu.kind === "mention") {
      /* Skills are linked by name, never inlined — a skill body reaches
       * ~100KB and would cost ~25k tokens a message. Backticking the name is
       * what the composed instructions already tell the agent to look for,
       * so skill_view pulls it in only if it turns out to be relevant. */
      const caret = el?.selectionStart ?? draft.length;
      const next = `${draft.slice(0, menu.start)}\`${item.title}\` ${draft.slice(caret)}`;
      setDraft(next);
      setMenu(null);
      // Put the caret after the inserted name rather than at the end — the
      // user may be mid-sentence.
      const at = menu.start + item.title.length + 3;
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(at, at);
      });
      return;
    }

    // Commands that take an argument stay in the box so it can be typed;
    // the rest fire immediately.
    const name = item.key;
    const command = parseCommand(`/${name}`)?.command;
    if (command?.takesText) {
      const next = `/${name} `;
      setDraft(next);
      setMenu(null);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(next.length, next.length);
      });
      return;
    }
    setMenu(null);
    if (command) {
      onCommand(command, "");
      clear();
    }
  };

  return (
    <div className="px-safe pb-safe relative z-20 shrink-0 bg-page pt-1">
      {/* the thread ends flush against the bar; fade it into the page colour
       * over the last few pixels rather than cutting it off at a hard edge */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-full h-8"
        style={{ background: "linear-gradient(to top, var(--page), transparent)" }}
      />
      <div
        // remounting on a new error restarts the shake — no state, and no
        // stale animation left running on the next render
        key={errorNonce}
        className="relative isolate mx-auto flex w-full max-w-3xl flex-col gap-1
          rounded-composer bg-surface p-2 shadow-raised"
        style={errorNonce > 0 ? { animation: "shake 400ms var(--ease-out-strong)" } : undefined}
      >
        {menu && menuOpen && (
          <ComposerMenu
            mode={menu}
            items={menuItems}
            index={menuIndex}
            onSelect={(_item, at) => applyMenuItem(at)}
            showUnroutedNote={menuItems.some((i) => i.disabled)}
          />
        )}

        {(attachments.length > 0 || uploading > 0 || uploadError) && (
          <div
            className="flex flex-wrap items-center gap-2 px-1 pt-1"
            style={{ animation: "fade-up var(--duration-quick) var(--ease-out-strong) both" }}
          >
            {attachments.map((attachment, i) => (
              <span
                key={i}
                className="flex h-9 max-w-[200px] items-center gap-2 rounded-control bg-field pl-1.5 pr-2
                  text-label text-ink-2"
              >
                {attachment.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      attachment.path
                        ? `/api/files?path=${encodeURIComponent(attachment.path)}`
                        : attachment.url
                    }
                    alt=""
                    className="size-6 shrink-0 rounded-[6px] object-cover"
                  />
                ) : (
                  <span className="flex size-6 shrink-0 items-center justify-center text-ink-3">
                    <IconFile size={14} />
                  </span>
                )}
                <span className="truncate">{attachment.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() =>
                    setAttachments((current) => current.filter((_, index) => index !== i))
                  }
                  className="tap-target -mr-0.5 grid size-5 shrink-0 place-items-center rounded-full text-ink-3 transition-colors duration-150 hover:bg-hover-2 hover:text-ink"
                >
                  <IconCross size={12} />
                </button>
              </span>
            ))}
            {uploading > 0 && (
              <span className="text-label text-ink-3 tabular-nums">
                Uploading {uploading}…
              </span>
            )}
            {uploadError && <span className="text-label text-red">{uploadError}</span>}
          </div>
        )}

        {/* Two rows, not one.
          *
          * The controls used to share a row with the textarea, which meant the
          * model chip ate into the prompt: Hermes model ids run to
          * "zai-org/glm-5.1:thinking" and "mimo-v2.5-pro-precision", so on a
          * 390px screen the box you type in was down to about 150px. Truncating
          * harder only moves the problem — any single-row layout loses to a
          * long enough id. Giving the prompt its own full-width row costs
          * ~30px of height and settles it for any name. */}
        <div className="flex flex-col gap-1">
          <input
            ref={fileRef}
            type="file"
            multiple
            // iOS turns this into Photo Library / Take Photo / Choose File
            accept="image/*,*/*"
            className="hidden"
            onChange={(event) => {
              void attach(event.target.files);
              // reset, or picking the same file twice in a row does nothing
              event.target.value = "";
            }}
          />
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setRecall(null);
              syncMenu(event.target.value, event.target.selectionStart ?? 0);
            }}
            // Clicking or arrowing into an existing @token should reopen the
            // menu; typing isn't the only way to end up inside one.
            onSelect={(event) => {
              const el = event.currentTarget;
              syncMenu(el.value, el.selectionStart ?? 0);
            }}
            onBlur={() => setMenu(null)}
            // A screenshot on the clipboard is the fastest way to show the
            // agent what you are looking at. Everything past attach() already
            // handles it — this is only the missing entry point.
            onPaste={(event) => {
              const files = Array.from(event.clipboardData?.items ?? [])
                .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
                .map((item) => item.getAsFile())
                .filter((file): file is File => file !== null);
              // A text paste has to stay a text paste — bail before
              // preventDefault(), not after.
              if (files.length === 0) return;
              event.preventDefault();
              void attach(files);
            }}
            onKeyDown={(event) => {
              if (menuOpen) {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setMenu(null);
                  return;
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const step = event.key === "ArrowDown" ? 1 : -1;
                  setMenuIndex((current) => {
                    let next = current;
                    for (let i = 0; i < menuItems.length; i += 1) {
                      next = (next + step + menuItems.length) % menuItems.length;
                      if (!menuItems[next].disabled) return next;
                    }
                    return current;
                  });
                  return;
                }
                if (
                  (event.key === "Enter" || event.key === "Tab") &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  applyMenuItem(menuIndex >= 0 ? menuIndex : firstSelectable);
                  return;
                }
              }
              /* ↑ in an empty box brings back the last prompt, the way a
               * shell does. Only from an empty box (or one still showing a
               * recalled prompt), so arrowing through a multi-line draft
               * still moves the caret. */
              if (
                (event.key === "ArrowUp" || event.key === "ArrowDown") &&
                !event.shiftKey &&
                !event.altKey &&
                !event.metaKey &&
                !event.ctrlKey &&
                history.length > 0 &&
                (draft === "" || recall !== null)
              ) {
                const up = event.key === "ArrowUp";
                const el = event.currentTarget;
                // Inside a recalled multi-line prompt, let the caret move
                // line by line until it is on the first (or last) line.
                if (recall !== null) {
                  const atEdge = up
                    ? !el.value.slice(0, el.selectionStart).includes("\n")
                    : !el.value.slice(el.selectionEnd).includes("\n");
                  if (!atEdge) return;
                }
                if (!up && recall === null) return;
                event.preventDefault();
                const next =
                  recall === null ? history.length - 1 : recall + (up ? -1 : 1);
                if (next >= history.length) {
                  setRecall(null);
                  setDraft("");
                  return;
                }
                const at = Math.max(0, next);
                setRecall(at);
                setDraft(history[at]);
                return;
              }
              if (!prefs.sendOnEnter) return;
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={
              placeholder ?? (running
                ? features.run_steer
                  ? "Steer the run…"
                  : "Queue a follow-up…"
                : `Message ${agentName}…`)
            }
            aria-label="Prompt"
            className="min-h-10 w-full min-w-0 resize-none bg-transparent
              px-2.5 py-2 text-input text-ink outline-none
              [overflow-wrap:anywhere] placeholder:text-ink-3"
          />

          {/* Model and thinking share the third column. Both are per-project
            * run settings and both are things you reach for while writing the
            * prompt, so they sit with it rather than in a sheet. */}
          {/* Controls sit under the prompt: attach, what will run, and send. */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Attach a file"
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
              className="tap-target flex size-9 shrink-0 items-center
                justify-center rounded-full text-ink-2 transition-[color,background-color,transform] duration-150
                enabled:hover:bg-hover enabled:hover:text-ink enabled:active:scale-[0.94]
                disabled:opacity-40"
            >
              <IconPaperclip size={18} />
            </button>

            <div className="flex min-w-0 flex-1 items-center">
              {modelLabel &&
                (onPickModel ? (
                  <button
                    type="button"
                    onClick={onPickModel}
                    aria-label={`Model: ${modelLabel}. Change it.`}
                    className="tap-target flex h-9 min-w-0 items-center gap-1.5
                      rounded-full px-2.5 text-label text-ink-2 transition-[color,background-color,transform] duration-150
                      hover:bg-hover hover:text-ink active:scale-[0.96]"
                  >
                    <IconChip size={15} className="shrink-0" />
                    <span className="truncate">{modelLabel}</span>
                  </button>
                ) : (
                  <span className="flex h-9 min-w-0 items-center truncate px-2.5 text-label text-ink-3">
                    {modelLabel}
                  </span>
                ))}
              {thinkingEffort !== undefined && onThinkingChange && (
                <ThinkingChip
                  effort={thinkingEffort}
                  onChange={onThinkingChange}
                  disabled={disabled}
                />
              )}
            </div>

            {running && canSend && (
              <span
                className="shrink-0 px-1.5 text-meta text-ink-3"
                style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
              >
                {/* attachments always queue — steer is text-only */}
                {features.run_steer && attachments.length === 0 ? "steers the run" : "queues next"}
              </span>
            )}

            {/* Stop and send are two buttons, not one that morphs. A single
              * button meant that the moment a run started the only thing you
              * could do was kill it — the placeholder said "Steer the run…"
              * and there was nothing to press. sendMessage() steers first and
              * falls back to the queue, so sending mid-run is the normal
              * case, not the exception. */}
            {running && (
              <button
                type="button"
                aria-label={stopping ? "Stopping" : "Stop run"}
                // Stopping is cooperative — the run keeps streaming until it
                // settles, and a second /stop does nothing but look broken.
                disabled={stopping}
                onClick={onStop}
                className="tap-target flex size-9 shrink-0 items-center justify-center
                  rounded-full bg-field text-ink transition-[background-color,transform] duration-150
                  enabled:active:scale-[0.94] disabled:opacity-40"
                style={{ animation: "pop-in var(--duration-fast) var(--ease-out-strong) both" }}
              >
                <IconStop size={15} />
              </button>
            )}

            <button
              type="button"
              aria-label={running ? "Steer the run" : "Send"}
              disabled={!canSend}
              onClick={send}
              className="tap-target flex size-9 shrink-0 items-center
                justify-center rounded-full transition-[background-color,color,transform] duration-150
                enabled:active:scale-[0.94]"
              // Disabled reads as recessed — field on surface, faint glyph —
              // rather than a second grey that looks almost pressable.
              style={{
                background: canSend ? "var(--ink)" : "var(--field)",
                color: canSend ? "var(--page)" : "var(--ink-3)",
              }}
            >
              <IconArrowUp size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
