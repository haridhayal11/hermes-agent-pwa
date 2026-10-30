"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { ICON_BUTTON } from "@/components/ui/SettingsControls";
import { formatSize } from "@/components/chat/FileLinks";
import { useHydrated } from "@/components/chat/MessageActions";
import { IconCross, IconFile, IconFolder } from "@/components/primitives/icons";
import type { ProjectFile } from "@/lib/project-files";
import { relativeTime } from "@/lib/relative-time";

/* Everything the agent has handed over in this project, and everything that
 * was uploaded to it — so "the PDF it made last Tuesday" is a tap, not a
 * scroll back through weeks of thread. Read from disk each time it opens. */

function isPreviewable(file: ProjectFile) {
  // SVG is a script container and agent-authored; /api/files never inlines it.
  return file.mime.startsWith("image/") && file.mime !== "image/svg+xml";
}

function FileRow({ file, hydrated }: { file: ProjectFile; hydrated: boolean }) {
  const href = `/api/files?path=${encodeURIComponent(file.path)}`;
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="-mx-2 flex min-h-12 items-center gap-3 rounded-control px-2 py-1.5 transition-colors duration-150 hover:bg-hover"
      >
        {isPreviewable(file) ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by our own allowlisted route
          <img
            src={href}
            alt=""
            loading="lazy"
            className="size-10 shrink-0 rounded-[8px] bg-field object-cover"
          />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-field text-ink-2">
            <IconFile size={18} />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-ui text-ink">{file.name}</span>
          <span className="truncate text-meta text-ink-3 tabular-nums">
            {formatSize(file.size)}
            {hydrated && ` · ${relativeTime(file.modifiedAt)}`}
            {file.relative !== file.name && ` · ${file.relative.slice(0, -file.name.length - 1)}`}
          </span>
        </span>
      </a>
    </li>
  );
}

export function FilesSheet({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Files">
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
        <span className="flex items-center gap-2 text-title font-semibold text-ink">
          <IconFolder size={16} className="text-ink-2" />
          Files
        </span>
        <button type="button" aria-label="Close" onClick={onClose} className={`${ICON_BUTTON} -mr-2`}>
          <IconCross size={16} />
        </button>
      </div>
      {/* remounted per open, so the list is read fresh every time */}
      {open && <FilesList projectId={projectId} />}
    </Sheet>
  );
}

function FilesList({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const hydrated = useHydrated();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/files`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((body: { files: ProjectFile[] }) => {
        if (!cancelled) setFiles(body.files);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const fromAgent = files?.filter((file) => file.source === "outbox") ?? [];
  const uploads = files?.filter((file) => file.source === "uploads") ?? [];

  return (
    <div className="flex flex-col gap-5 px-5 pb-5">
      {!files && !failed && <p className="text-label text-ink-3">Loading…</p>}
      {failed && <p className="text-label text-ink-3">Couldn&rsquo;t read this project&rsquo;s files.</p>}
      {files && files.length === 0 && (
        <p className="text-label text-ink-3">
          Nothing yet. Files the agent hands you, and files you attach, collect here.
        </p>
      )}
      {fromAgent.length > 0 && (
        <section>
          <h3 className="pb-1 text-label font-medium text-ink-3">From the agent</h3>
          <ul>
            {fromAgent.map((file) => (
              <FileRow key={file.path} file={file} hydrated={hydrated} />
            ))}
          </ul>
        </section>
      )}
      {uploads.length > 0 && (
        <section>
          <h3 className="pb-1 text-label font-medium text-ink-3">Uploads</h3>
          <ul>
            {uploads.map((file) => (
              <FileRow key={file.path} file={file} hydrated={hydrated} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
