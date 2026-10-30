"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { ICON_BUTTON } from "@/components/ui/SettingsControls";
import { IconChevronRight, IconCross, IconDiff, IconRetry } from "@/components/primitives/icons";
import type { ChangedFile, ChangeStatus, GitChanges } from "@/lib/git-changes";

/* "What changed" in the project's working directory since the last commit —
 * the question you have after a long run, on a phone, where the alternative
 * is asking the agent and spending a turn on a read. Read-only. */

const LETTER: Record<ChangeStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  untracked: "?",
  conflicted: "U",
};

const LABEL: Record<ChangeStatus, string> = {
  added: "Added",
  modified: "Modified",
  deleted: "Deleted",
  renamed: "Renamed",
  untracked: "New, not staged",
  conflicted: "Conflicted",
};

function Counts({ additions, deletions }: { additions: number | null; deletions: number | null }) {
  if (additions === null && deletions === null) return null;
  return (
    <span className="shrink-0 font-mono text-meta tabular-nums">
      <span className="text-green">+{additions ?? 0}</span>{" "}
      <span className="text-red">−{deletions ?? 0}</span>
    </span>
  );
}

/** One line of a unified diff, tinted by what it does. Text only — no HTML. */
function PatchLine({ line }: { line: string }) {
  const kind = line.startsWith("+++") || line.startsWith("---")
    ? "meta"
    : line.startsWith("+")
      ? "add"
      : line.startsWith("-")
        ? "remove"
        : line.startsWith("@@")
          ? "hunk"
          : line.startsWith("diff ") || line.startsWith("index ") || /^(new|deleted|similarity|rename) /.test(line)
            ? "meta"
            : "context";
  const style =
    kind === "add"
      ? "bg-green-tint text-ink"
      : kind === "remove"
        ? "bg-red-tint text-ink"
        : kind === "hunk"
          ? "text-ink-3"
          : kind === "meta"
            ? "hidden"
            : "text-ink-2";
  return <div className={`px-3 whitespace-pre ${style}`}>{line || " "}</div>;
}

function FileEntry({ file }: { file: ChangedFile }) {
  const [open, setOpen] = useState(false);
  const expandable = file.patch !== null;
  const slash = file.path.lastIndexOf("/");
  const dir = slash >= 0 ? file.path.slice(0, slash + 1) : "";
  const base = file.path.slice(slash + 1);
  return (
    <li>
      <button
        type="button"
        onClick={() => expandable && setOpen((value) => !value)}
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
        className="-mx-2 flex min-h-10 w-[calc(100%+16px)] items-center gap-2.5 rounded-control px-2 py-1.5 text-left
          transition-colors duration-150 enabled:hover:bg-hover"
      >
        <span
          title={LABEL[file.status]}
          className={`grid size-5 shrink-0 place-items-center rounded-[5px] font-mono text-micro font-semibold ${
            file.status === "conflicted" ? "bg-red-tint text-red" : "bg-field text-ink-2"
          }`}
        >
          {LETTER[file.status]}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-label" title={file.path}>
          <span className="text-ink-3">{dir}</span>
          <span className="text-ink">{base}</span>
          {file.oldPath && <span className="text-ink-3"> ← {file.oldPath}</span>}
        </span>
        {file.binary ? (
          <span className="shrink-0 text-meta text-ink-3">binary</span>
        ) : (
          <Counts additions={file.additions} deletions={file.deletions} />
        )}
        <span
          aria-hidden
          className={`shrink-0 text-ink-3 transition-transform duration-150 ${expandable ? "" : "invisible"}`}
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        >
          <IconChevronRight size={14} />
        </span>
      </button>
      {open && file.patch && (
        <div
          className="scroll-area mt-1 mb-2 overflow-x-auto rounded-control bg-inset py-2 font-mono text-meta leading-[1.6] shadow-hairline"
          style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
        >
          <div className="min-w-max">
            {file.patch.split("\n").map((line, index) => (
              <PatchLine key={index} line={line} />
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

export function DiffSheet({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [nonce, setNonce] = useState(0);
  return (
    <Sheet open={open} onClose={onClose} label="What changed" wide>
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
        <span className="flex items-center gap-2 text-title font-semibold text-ink">
          <IconDiff size={16} className="text-ink-2" />
          What changed
        </span>
        <span className="-mr-2 flex items-center">
          <button
            type="button"
            aria-label="Refresh"
            title="Refresh"
            onClick={() => setNonce((value) => value + 1)}
            className={ICON_BUTTON}
          >
            <IconRetry size={16} />
          </button>
          <button type="button" aria-label="Close" onClick={onClose} className={ICON_BUTTON}>
            <IconCross size={16} />
          </button>
        </span>
      </div>
      {open && <DiffBody key={nonce} projectId={projectId} />}
    </Sheet>
  );
}

function DiffBody({ projectId }: { projectId: string }) {
  const [changes, setChanges] = useState<GitChanges | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/git-changes`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((body: GitChanges) => {
        if (!cancelled) setChanges(body);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (failed) {
    return <p className="px-5 text-label text-ink-3">Couldn&rsquo;t reach the server.</p>;
  }
  if (!changes) return <p className="px-5 text-label text-ink-3">Reading the working tree…</p>;
  if (!changes.repo) return <p className="px-5 text-label text-ink-3">{changes.reason}.</p>;

  const fileCount = changes.files.length;
  return (
    <div className="flex flex-col gap-3 px-5 pb-5">
      <p className="flex flex-wrap items-baseline gap-x-2 text-label text-ink-2">
        {changes.branch && <span className="font-mono text-ink">{changes.branch}</span>}
        <span>
          {fileCount === 0
            ? "Nothing changed since the last commit."
            : `${fileCount} ${fileCount === 1 ? "file" : "files"} changed`}
        </span>
        {fileCount > 0 && <Counts additions={changes.additions} deletions={changes.deletions} />}
      </p>
      <p className="-mt-2 truncate font-mono text-meta text-ink-3" title={changes.root}>
        {changes.root}
      </p>
      {fileCount > 0 && (
        <ul className="flex flex-col">
          {changes.files.map((file) => (
            <FileEntry key={file.path} file={file} />
          ))}
        </ul>
      )}
      {changes.truncated && (
        <p className="text-label text-ink-3">
          Some changes are too large to show here; they&rsquo;re listed without their lines.
        </p>
      )}
    </div>
  );
}
