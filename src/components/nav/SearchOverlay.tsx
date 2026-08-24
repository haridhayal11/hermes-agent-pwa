"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconCross, IconMessage, IconSearch } from "@/components/primitives/icons";

/* Cross-project search. Full-screen rather than a dropdown: on a phone the
 * results list is the whole job, and a popover anchored to a 36px header
 * button would be a 3-line window onto it. */

interface ProjectHit {
  id: string;
  name: string;
  emoji: string | null;
  snippet: string | null;
}

interface MessageHit {
  projectId: string;
  projectName: string;
  projectEmoji: string | null;
  runId: string;
  preview: string;
  startedAt: number;
}

interface DeliveryHit {
  id: string;
  projectId: string;
  projectName: string;
  projectEmoji: string | null;
  jobName: string;
  snippet: string;
  ts: number;
}

interface Results {
  projects: ProjectHit[];
  messages: MessageHit[];
  deliveries: DeliveryHit[];
}

const EMPTY: Results = { projects: [], messages: [], deliveries: [] };

export function SearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  // Mounting only while open is what clears the last query — the same trick
  // NewProjectDialog uses to reset its form.
  return <SearchPanel onClose={onClose} />;
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  // Two characters is the floor the route enforces too; below it there is
  // nothing to show and nothing to fetch, so both are derived rather than
  // pushed back into state from an effect.
  const active = trimmed.length >= 2;
  const shown = active ? results : EMPTY;
  const loading = active && pending;

  useEffect(() => {
    // iOS won't focus without a frame of delay after the mount
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setPending(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        setResults((await res.json()) as Results);
      } catch {
        // aborted by the next keystroke, or the route failed — either way the
        // previous results stay on screen rather than flashing empty
      } finally {
        setPending(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [trimmed, active]);

  const empty =
    active && !loading && shown.projects.length === 0 && shown.messages.length === 0;

  return (
    <div className="h-app fixed inset-x-0 top-0 z-60 flex flex-col bg-page">
      <div className="pt-safe shrink-0 border-b border-line bg-page">
        <div className="px-safe flex h-14 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-line
            bg-field px-2.5 transition-colors duration-150 focus-within:border-line-strong">
            <span className="shrink-0 text-ink-3">
              <IconSearch size={15} />
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Search projects and prompts…"
              aria-label="Search"
              className="h-9 min-w-0 flex-1 bg-transparent text-input text-ink outline-none
                placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="tap-target flex size-9 shrink-0 items-center justify-center rounded-control
              text-ink-2 transition-colors duration-100 hover:bg-hover-2 hover:text-ink
              active:scale-[0.96]"
          >
            <IconCross size={16} />
          </button>
        </div>
      </div>

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="px-safe pb-safe mx-auto w-full max-w-3xl pt-2">
          {!active && (
            <p className="py-10 text-center text-label text-ink-3">
              Type at least two characters.
            </p>
          )}

          {empty && (
            <p className="py-10 text-center text-label text-ink-3">
              Nothing matched “{trimmed}”.
            </p>
          )}

          {shown.projects.length > 0 && (
            <Section label="Projects">
              {shown.projects.map((hit) => (
                <Row
                  key={hit.id}
                  href={`/p/${hit.id}`}
                  onNavigate={onClose}
                  glyph={hit.emoji ?? hit.name.trim().charAt(0).toUpperCase() ?? "•"}
                  title={hit.name}
                  detail={hit.snippet}
                />
              ))}
            </Section>
          )}

          {shown.messages.length > 0 && (
            <Section label="Prompts">
              {shown.messages.map((hit) => (
                <Row
                  key={hit.runId}
                  href={`/p/${hit.projectId}`}
                  onNavigate={onClose}
                  icon={<IconMessage size={14} />}
                  title={hit.preview}
                  detail={`${hit.projectEmoji ? `${hit.projectEmoji} ` : ""}${
                    hit.projectName
                  } · ${new Date(hit.startedAt).toLocaleDateString()}`}
                />
              ))}
            </Section>
          )}

          {shown.deliveries.length > 0 && (
            <Section label="Scheduled">
              {shown.deliveries.map((hit) => (
                <Row
                  key={hit.id}
                  href={`/p/${hit.projectId}`}
                  onNavigate={onClose}
                  icon={<IconMessage size={14} />}
                  title={hit.snippet}
                  detail={`${hit.jobName} · ${
                    hit.projectEmoji ? `${hit.projectEmoji} ` : ""
                  }${hit.projectName} · ${new Date(hit.ts).toLocaleDateString()}`}
                />
              ))}
            </Section>
          )}

          {/* Says what was searched, so an absent result isn't read as an
              absent message. Transcript bodies are not indexed — a scheduled
              job's report is, because that copy is ours. */}
          {(shown.projects.length > 0 ||
            shown.messages.length > 0 ||
            shown.deliveries.length > 0) && (
            <p className="px-1 py-4 text-meta text-ink-3">
              Project names, instructions, the opening prompt of each run, and
              what scheduled jobs reported. Message bodies live in Hermes and
              aren’t searchable.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pb-3" style={{ animation: "fade-up var(--duration-fast) var(--ease-out-strong) both" }}>
      <h2 className="px-1 pt-3 pb-1 text-meta font-medium tracking-wide text-ink-3 uppercase">
        {label}
      </h2>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Row({
  href,
  onNavigate,
  glyph,
  icon,
  title,
  detail,
}: {
  href: string;
  onNavigate: () => void;
  glyph?: string;
  icon?: React.ReactNode;
  title: string;
  detail?: string | null;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="-mx-1 flex min-h-11 items-center gap-2.5 rounded-control px-1 py-1.5
        transition-colors duration-100 hover:bg-hover-2 active:scale-[0.99]"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-control bg-canvas text-ink-3 shadow-hairline">
        {icon ?? <span className="text-[15px] leading-none">{glyph}</span>}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-label font-medium text-ink">{title}</span>
        {detail && <span className="truncate text-meta text-ink-3">{detail}</span>}
      </span>
    </Link>
  );
}
