"use client";

import { useCallback, useState } from "react";

/* beautifului.dev's CodeBlock with the scripted line-by-line reveal removed —
 * agent output arrives as whole fences, and re-animating text the model already
 * finished writing reads as noise. Copy is the real clipboard. */

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const lines = code.replace(/\n$/, "").split("\n");

  const copy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  return (
    <div className="my-2 w-full overflow-hidden rounded-card bg-surface shadow-hairline">
      <div className="primitive-card-bar flex items-center justify-between border-b border-line">
        <span className="font-mono text-meta text-ink-3">{language || "text"}</span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={copy}
          className={`flex h-6 items-center gap-1 rounded-chip px-1.5 text-meta font-medium
            transition-colors duration-100 hover:bg-hover
            ${copied ? "text-green" : "text-ink-3 hover:text-ink"}`}
        >
          {copied ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="12" height="12" rx="2.5" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <pre className="overflow-x-auto bg-inset px-3 py-2.5 font-mono text-meta leading-[1.7]">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-6 shrink-0 text-right text-micro leading-[1.86] text-ink-3/60 select-none">
              {i + 1}
            </span>
            <span className="pl-2.5 whitespace-pre text-ink-2">{line || " "}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
