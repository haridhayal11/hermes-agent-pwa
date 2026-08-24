"use client";

import { useEffect, useState } from "react";
import { IconFile } from "@/components/primitives/icons";

/* Hermes has no way to send a file. /v1/runs takes images in and nothing
 * comes back out — there is no download endpoint on :8642 at all. What the
 * agent actually does, given a file it made, is say where it put it:
 *
 *   "Latest PDF: /home/user/job-hunting/cv/base/main.pdf"
 *
 * which is inert text on a phone. So the thread reads paths back out of the
 * reply and offers them, via /api/files. The same scrape runs over user turns,
 * where the composer's own uploads are named the same way — which is what
 * makes an attachment still be there after history reloads, since Hermes
 * returns the text and nothing else.
 *
 * Nothing is trusted from the text: /api/files answers only for paths inside
 * the allowlisted roots, and the probe below is what decides whether a chip
 * appears at all. A path the agent invented, or one pointing at ~/.ssh, simply
 * doesn't render. */

/* Absolute POSIX paths with a file extension. The extension requirement is
 * what keeps this from matching "/home/user" in prose or the "and/or" in a
 * sentence; the leading guard keeps it off URLs, since `//host/a.png` inside
 * https:// would otherwise look like a path. */
const PATH_RE = /(?<![\w:/])(\/(?:[\w.+@%-]+\/)*[\w.+@%-]+\.[A-Za-z0-9]{1,8})(?![\w/])/g;

export interface ProbedFile {
  path: string;
  exists: boolean;
  allowed: boolean;
  name: string;
  size: number;
  mime: string;
}

export function extractPaths(text: string): string[] {
  // URLs first: the path inside `?path=/x/y.png` is not a local file, and the
  // lookbehind can't see far enough back to know that.
  const prose = text.replace(/\b[a-z][\w+.-]*:\/\/\S+/gi, " ");
  const found = new Set<string>();
  for (const match of prose.matchAll(PATH_RE)) {
    // Trailing punctuation is part of the sentence, not the filename.
    found.add(match[1].replace(/[.,;:)\]}'"]+$/, ""));
  }
  return [...found];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileLinks({
  text,
  /** paths already rendered by the live turn's own attachment strip */
  exclude = [],
}: {
  text: string;
  exclude?: string[];
}) {
  const [files, setFiles] = useState<ProbedFile[]>([]);
  const paths = extractPaths(text);
  // Stable across renders of the same content, so the effect doesn't refire
  // on every streamed token once the text settles.
  const key = paths.join("\u0000");

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const probe = async () => {
      try {
        const res = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: key.split("\u0000") }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { files: ProbedFile[] };
        setFiles(body.files.filter((f) => f.exists && f.allowed));
      } catch {
        // aborted, or the route failed — no chips, the path stays in the text
      }
    };
    void probe();
    return () => controller.abort();
  }, [key]);

  const shown = files.filter((file) => !exclude.includes(file.path));
  if (shown.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-1.5 pt-0.5"
      style={{ animation: "fade-up var(--duration-fast) var(--ease-out-strong) both" }}
    >
      {shown.map((file) => {
        const href = `/api/files?path=${encodeURIComponent(file.path)}`;
        const isImage =
          file.mime.startsWith("image/") && file.mime !== "image/svg+xml";

        if (isImage) {
          return (
            <a key={file.path} href={href} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={href}
                alt={file.name}
                className="max-h-56 max-w-full rounded-control object-cover shadow-hairline"
              />
            </a>
          );
        }

        return (
          <a
            key={file.path}
            href={href}
            // A phone should open the PDF, not park it in Files — the route
            // sets Content-Disposition per type and this follows it.
            target="_blank"
            rel="noreferrer"
            className="flex h-9 max-w-full items-center gap-2 rounded-control bg-field px-2.5
              text-label text-ink-2 shadow-hairline transition-colors duration-100
              hover:bg-hover-2 hover:text-ink active:scale-[0.98]"
          >
            <span className="shrink-0 text-ink-3">
              <IconFile size={14} />
            </span>
            <span className="truncate font-medium">{file.name}</span>
            <span className="shrink-0 text-meta text-ink-3 tabular-nums">
              {formatSize(file.size)}
            </span>
          </a>
        );
      })}
    </div>
  );
}
