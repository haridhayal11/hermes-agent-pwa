"use client";

import { CodeBlock } from "./CodeBlock";
import { FileLinks } from "./FileLinks";
import { RecommendationCard } from "./RecommendationCard";
import {
  extractQuestion,
  parseRecommendation,
  questionAt,
  splitFences,
} from "@/lib/recommendation";

export { extractQuestion, splitFences };
import { IconCheck, IconFile } from "@/components/primitives/icons";
import { parseBlocks, type Block, type ListBlock } from "@/lib/markdown-blocks";
import { RECOMMEND_FENCE } from "@/lib/chat-types";
import type { Attachment, CronMeta } from "@/lib/chat-types";
import { useAgentName } from "@/components/AgentNameContext";

/* Message shapes follow ChatComposer's visual spec rather than its code —
 * that component takes no props at all. User turns are bubbles; assistant
 * turns are labelled sections, and a section still resolving eases back to
 * 85% opacity — still fully readable, since that is when the reader decides
 * the approval it is waiting on. */


/* Inline Markdown for generated text declared as `content_format: markdown`.
 *
 * There is still no markdown *document* renderer here, and the reason has not
 * changed: agent output must not be able to inject markup. This is narrower —
 * it tokenises the supported inline spans and builds React elements, so the text stays
 * text and there is no HTML anywhere in the path.
 *
 * Generated assistant output and cron reports share the same server-declared
 * contract. Plain messages never enter this path.
 */
const INLINE_MD = /(\[[^\]\n]+\]\(https?:\/\/[^\s)\n]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/gi;

export function renderInline(text: string): React.ReactNode[] {
  return text.split(INLINE_MD).map((token, i) => {
    if (i % 2 === 0) return token;
    const link = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)\n]+)\)$/i.exec(token);
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline decoration-ink-3 underline-offset-[3px] transition-[text-decoration-color] duration-150 hover:decoration-accent"
        >
          {link[1]}
        </a>
      );
    }
    if (token.startsWith("**") || token.startsWith("__")) {
      return (
        <strong key={i} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith("`")) {
      return (
        <code key={i} className="rounded-[6px] bg-field px-[0.35em] py-[0.1em] font-mono text-[0.875em]">
          {token.slice(1, -1)}
        </code>
      );
    }
    return (
      <em key={i} className="italic">
        {token.slice(1, -1)}
      </em>
    );
  });
}

/* Block structure for the same declared-Markdown messages: headings, lists,
 * quotes, rules and tables. `parseBlocks` only tokenises; every element here
 * is built by React and every text field goes through renderInline, so the
 * no-HTML guarantee above holds for blocks too. */

function List({ list }: { list: ListBlock }) {
  const Tag = list.ordered ? "ol" : "ul";
  const tasks = list.items.some((item) => item.checked !== undefined);
  return (
    <Tag
      start={list.ordered && list.start !== 1 ? list.start : undefined}
      className={`flex flex-col gap-1.5 pl-6 marker:text-ink-2 ${
        tasks ? "list-none pl-1" : list.ordered ? "list-decimal" : "list-disc"
      }`}
    >
      {list.items.map((item, i) => (
        <li key={i} className="pl-0.5 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {item.checked !== undefined && (
            <span
              aria-label={item.checked ? "done" : "not done"}
              className={`mr-2 inline-grid size-3.5 translate-y-0.5 place-items-center rounded-[4px] ${
                item.checked ? "bg-ink text-surface" : "shadow-[inset_0_0_0_1.5px_var(--line-strong)]"
              }`}
            >
              {item.checked && <IconCheck size={10} strokeWidth={3} />}
            </span>
          )}
          {renderInline(item.text)}
          {item.children && (
            <div className="mt-1">
              <List list={item.children} />
            </div>
          )}
        </li>
      ))}
    </Tag>
  );
}

/* A column whose every filled cell is a number (a price, a count, a
 * percentage) reads right-aligned, so the digits line up; an explicit `---:`
 * in the Markdown still wins. */
const NUMERIC_CELL = /^[-+−]?[$€£¥]?\d[\d.,\s]*%?$/;

function tableAlignment(block: Extract<Block, { type: "table" }>): Array<"left" | "right" | "center"> {
  return block.header.map((_, c) => {
    const declared = block.align[c];
    if (declared) return declared;
    const cells = block.rows
      .map((row) => (row[c] ?? "").replace(/[*_`]/g, "").trim())
      .filter((cell) => cell.length > 0);
    return cells.length > 0 && cells.every((cell) => NUMERIC_CELL.test(cell)) ? "right" : "left";
  });
}

function MarkdownBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return (
        <p
          role="heading"
          aria-level={block.level + 1}
          // More room above a heading than below it: the blocks are spaced by
          // the column's gap, so the margins only shift that space upward.
          className="mt-2 -mb-1.5 font-semibold text-balance text-ink first:mt-0 [overflow-wrap:anywhere]"
          style={{
            fontSize:
              block.level === 1 ? "calc(var(--text-body) * 1.25)" : block.level === 2 ? "calc(var(--text-body) * 1.125)" : "var(--text-body)",
            lineHeight: 1.4,
          }}
        >
          {renderInline(block.text)}
        </p>
      );
    case "list":
      return (
        <div className="text-body text-ink">
          <List list={block} />
        </div>
      );
    case "quote":
      return (
        <blockquote className="flex flex-col gap-3 border-l-2 border-line-strong pl-4 text-ink-2">
          {block.blocks.map((inner, i) => (
            <MarkdownBlock key={i} block={inner} />
          ))}
        </blockquote>
      );
    case "rule":
      return <hr className="my-2 border-line" />;
    case "table": {
      const align = tableAlignment(block);
      return (
        // its own horizontal scroll, so a wide table never widens the thread;
        // the edge shade says there is more to the side
        <div className="scroll-area scroll-fade-x overflow-x-auto">
          <table className="w-full border-collapse text-ui text-ink tabular-nums">
            <thead className="border-b border-line-strong">
              <tr>
                {block.header.map((cell, c) => (
                  <th
                    key={c}
                    className="px-3 py-2 font-semibold whitespace-nowrap first:pl-0 last:pr-0"
                    style={{ textAlign: align[c] }}
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-line last:border-b-0">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      // break-word, not anywhere: `anywhere` lets the table shrink
                      // a cell to one character and split "7.99" across lines;
                      // whole words keep their width and the wrapper scrolls.
                      // The first column usually names the row, so it gets
                      // enough width to stay at a line or two.
                      className="min-w-16 px-3 py-2 align-top first:min-w-32 first:pl-0 last:pr-0 [overflow-wrap:break-word]"
                      style={{ textAlign: align[c] }}
                    >
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "paragraph":
      return (
        <p className="text-body whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
          {renderInline(block.text)}
        </p>
      );
  }
}

export function MessageBody({
  content,
  streaming = false,
  hoistQuestions = false,
  markdown = false,
  onRecommendationAction,
}: {
  content: string;
  /** text is still arriving, so a fence may be half-written */
  streaming?: boolean;
  /** the thread is showing the question card above the composer instead */
  hoistQuestions?: boolean;
  /** resolve inline bold/italic/code rather than printing the markers */
  markdown?: boolean;
  /** only passed for the newest assistant turn — see RecommendationCard */
  onRecommendationAction?: (reply: string) => void;
}) {
  const segments = splitFences(content);
  const hoisted = hoistQuestions ? questionAt(segments) : -1;

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.kind !== "code" && markdown) {
          return parseBlocks(segment.value).map((block, b) => (
            <MarkdownBlock key={`${i}.${b}`} block={block} />
          ));
        }
        if (segment.kind !== "code") {
          return (
            <p
              key={i}
              className="text-body whitespace-pre-wrap text-ink [overflow-wrap:anywhere]"
            >
              {segment.value.trim()}
            </p>
          );
        }
        if (segment.language === RECOMMEND_FENCE) {
          // This exact card is pinned above the composer — drawing it here
          // too would ask the same question twice.
          if (i === hoisted) return null;
          const recommendation = parseRecommendation(segment.value);
          if (recommendation) {
            return (
              <RecommendationCard
                key={i}
                recommendation={recommendation}
                onAction={onRecommendationAction}
              />
            );
          }
          /* splitFences matches an unterminated fence, so mid-stream this is
           * half a JSON object. Rendering it would paint raw braces into the
           * thread and then snap them into a card. Hold it back until the run
           * settles — at which point unparseable really does mean malformed,
           * and the code block below is the honest fallback rather than
           * swallowing text the agent meant to be read. */
          if (streaming) return null;
        }
        return <CodeBlock key={i} code={segment.value} language={segment.language} />;
      })}
    </>
  );
}

/* Attachment chips, shown on the turn that carried them. Images are inline
 * data: URLs, so there is nothing to fetch; files are links back through
 * /api/files, which is path-allowlisted server-side. */
export function AttachmentStrip({
  attachments,
  align = "start",
}: {
  attachments: Attachment[];
  align?: "start" | "end";
}) {
  if (attachments.length === 0) return null;
  return (
    <div
      className={`flex flex-wrap gap-1.5 ${align === "end" ? "justify-end" : ""}`}
    >
      {attachments.map((attachment, i) =>
        attachment.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            // Prefer the stored copy: a phone photo's data: URL is megabytes of
            // base64 sitting in the DOM for as long as the thread is open.
            src={
              attachment.path
                ? `/api/files?path=${encodeURIComponent(attachment.path)}`
                : attachment.url
            }
            alt={attachment.name}
            className="max-h-48 max-w-[70%] rounded-card object-cover shadow-hairline"
          />
        ) : (
          <a
            key={i}
            href={`/api/files?path=${encodeURIComponent(attachment.path)}`}
            className="flex h-9 max-w-full items-center gap-2 rounded-control bg-field px-3
              text-label text-ink-2 transition-colors duration-150
              hover:text-ink"
          >
            <span className="shrink-0 text-ink-3">
              <IconFile size={14} />
            </span>
            <span className="truncate">{attachment.name}</span>
          </a>
        ),
      )}
    </div>
  );
}

export function UserMessage({
  content,
  attachments,
  footer,
}: {
  content: string;
  attachments?: Attachment[];
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="group/msg flex flex-col items-end gap-1.5 pl-10 sm:pl-16"
      style={{ animation: "fade-up var(--duration-medium) var(--ease-out-strong) both" }}
    >
      {attachments && attachments.length > 0 && (
        <AttachmentStrip attachments={attachments} align="end" />
      )}
      {content.trim() && (
        // A plain rounded bubble with no outline: it separates from the page
        // by value alone. Tighter leading than the reply, since it is short
        // and the reply is what gets read at length.
        <div className="max-w-full rounded-bubble bg-bubble px-4 py-2.5 text-body leading-[1.55] text-ink [overflow-wrap:anywhere] whitespace-pre-wrap">
          {content}
        </div>
      )}
      {/* On the live turn the strip above already drew these; after a reload
        * `attachments` is gone and this is what brings them back, from the
        * paths composeInput() wrote into the prompt. */}
      <FileLinks
        text={content}
        exclude={(attachments ?? []).flatMap((a) => (a.path ? [a.path] : []))}
      />
      {footer}
    </div>
  );
}

export function AssistantMessage({
  content,
  markdown = false,
  streaming = false,
  resolving = false,
  footer,
  hoistQuestions = false,
  onRecommendationAction,
}: {
  content: string;
  /** Interpret safe Markdown spans declared by the message contract. */
  markdown?: boolean;
  /** show the caret — text is still arriving */
  streaming?: boolean;
  /** eased back a step: written, but the run hasn't settled */
  resolving?: boolean;
  footer?: React.ReactNode;
  /** the thread is showing this turn's question card above the composer */
  hoistQuestions?: boolean;
  /** only set on the newest turn, so old cards' buttons go inert */
  onRecommendationAction?: (reply: string) => void;
}) {
  const agentName = useAgentName();

  return (
    <div
      // Resolving only eases the text back a step. It used to blur and shrink
      // as well, at exactly the moment the reader needs it to decide the
      // approval — and a filter over a long block is a repaint on a phone.
      // The approval card and the run dot already say the run is waiting.
      className="group/msg flex w-full flex-col gap-1.5 transition-opacity duration-300"
      style={{
        opacity: resolving ? 0.85 : 1,
        transitionTimingFunction: "var(--ease-out-strong)",
        animation: "fade-up var(--duration-slow) var(--ease-out-strong) both",
      }}
    >
      {/* The speaker label, set as a name rather than a tracked caps eyebrow. */}
      <div className="text-label font-semibold text-ink-2">{agentName}</div>
      <div className="flex flex-col gap-4">
        <MessageBody
          content={content}
          markdown={markdown}
          streaming={streaming}
          hoistQuestions={hoistQuestions}
          onRecommendationAction={onRecommendationAction}
        />
        {streaming && (
          <span
            aria-hidden
            className="inline-block h-3.5 w-0.5 translate-y-0.5 rounded-full bg-ink"
            style={{ animation: "caret-blink 1s step-end infinite" }}
          />
        )}
        {/* Not while streaming: a half-arrived path is a different path, and
          * probing it would 404 once per token. */}
        {!streaming && <FileLinks text={content} />}
      </div>
      {footer}
    </div>
  );
}

/* A scheduled job's result.
 *
 * Deliberately the same shape as an assistant turn — same label row, same
 * body, same spacing — because that is what it is to read: something the
 * agent said, in this project, unprompted. The only difference is the header, which
 * has to say so, since nobody typed the message that produced it.
 *
 * The body goes through MessageBody with its declared Markdown resolved. A
 * job runs unattended, but it can still end on a decision — the reader just
 * answers it later — so its question card is live while it is the newest
 * thing in the chat, exactly like an assistant turn's.
 */
export function CronMessage({
  content,
  meta,
  markdown,
  footer,
  hoistQuestions = false,
  onRecommendationAction,
}: {
  content: string;
  meta: CronMeta;
  markdown: boolean;
  footer?: React.ReactNode;
  /** the thread pins this report's question above the composer */
  hoistQuestions?: boolean;
  /** only for the newest message — older cards render inert */
  onRecommendationAction?: (reply: string) => void;
}) {
  return (
    <div
      className="group/msg flex w-full flex-col gap-1.5"
      style={{ animation: "fade-up var(--duration-slow) var(--ease-out-strong) both" }}
    >
      <div className="text-label font-semibold text-ink-2">
        Scheduled · {meta.jobName}
        {meta.status === "failed" ? <span className="text-red"> · failed</span> : ""}
      </div>
      <div className="flex flex-col gap-4">
        <MessageBody
          content={content}
          markdown={markdown}
          hoistQuestions={hoistQuestions}
          onRecommendationAction={onRecommendationAction}
        />
        {/* Same path probe as any other turn. A job that wrote outside the
          * outbox, the upload cache or a project cwd renders as plain text —
          * the allowlist is the security model, and a scheduled prompt naming
          * a path is no more evidence than an interactive one. */}
        <FileLinks text={content} />
      </div>
      {footer}
    </div>
  );
}

/**
 * What a slash command answered, run by the gateway (`slash.exec`). Headed
 * with the command, since nobody typed a message that produced it, and
 * rendered as the gateway's own Markdown — its replies are written for
 * Telegram, which renders the same subset.
 */
export function CommandMessage({ command, content }: { command: string; content: string }) {
  return (
    <div
      className="group/msg flex w-full flex-col gap-1.5"
      style={{ animation: "fade-up var(--duration-slow) var(--ease-out-strong) both" }}
    >
      <div className="font-mono text-label font-semibold text-ink-2">{command}</div>
      <div className="rounded-card bg-inset px-3.5 py-3 shadow-hairline">
        <MessageBody content={content} markdown />
      </div>
    </div>
  );
}

export function SystemMessage({ content }: { content: string }) {
  return (
    <p
      className="text-label text-ink-3"
      style={{ animation: "fade-in var(--duration-fast) ease-out both" }}
    >
      {content}
    </p>
  );
}
