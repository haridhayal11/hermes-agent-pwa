"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { IconCross, IconWrench } from "@/components/primitives/icons";
import type { HermesToolset } from "@/lib/hermes";

/* GET /v1/toolsets, rendered.
 *
 * This is the deterministic answer to "what can this agent actually do" —
 * the alternative is spending a turn asking the model and believing what it
 * says. Read-only: enabling a toolset is a gateway config change, and
 * api_server has no endpoint for it. */

export function ToolsetsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [toolsets, setToolsets] = useState<HermesToolset[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!open || toolsets) return;
    let cancelled = false;
    fetch("/api/toolsets")
      .then((r) => r.json())
      .then((body: { toolsets?: HermesToolset[]; unavailable?: boolean }) => {
        if (cancelled) return;
        setToolsets(body.toolsets ?? []);
        setUnavailable(body.unavailable === true);
      })
      .catch(() => {
        if (!cancelled) {
          setToolsets([]);
          setUnavailable(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, toolsets]);

  // Enabled first: what's live matters more than what could be.
  const sorted = [...(toolsets ?? [])].sort(
    (a, b) =>
      Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name),
  );

  return (
    <Sheet open={open} onClose={onClose} label="Toolsets">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-ui font-medium text-ink">
          <IconWrench size={14} className="text-ink-3" />
          Toolsets
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="primitive-icon-button flex items-center justify-center text-ink-3 hover:bg-hover-2 hover:text-ink"
        >
          <IconCross size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 px-2 pb-3">
        {!toolsets && <p className="px-2 py-3 text-meta text-ink-3">Loading…</p>}
        {unavailable && (
          <p className="px-2 py-3 text-meta leading-[1.5] text-ink-3">
            Hermes didn&rsquo;t answer with its toolset list.
          </p>
        )}
        {sorted.map((toolset) => (
          <div
            key={toolset.name}
            className="rounded-card bg-surface px-2.5 py-2 shadow-hairline"
            style={{ opacity: toolset.enabled ? 1 : 0.55 }}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-label font-medium text-ink">
                {toolset.label || toolset.name}
              </span>
              <span
                className={`rounded-chip px-1.5 text-meta ${
                  toolset.enabled
                    ? "bg-green-tint text-green"
                    : "bg-field text-ink-3"
                }`}
              >
                {toolset.enabled ? "on" : "off"}
              </span>
              {toolset.enabled && toolset.configured === false && (
                <span className="rounded-chip bg-orange-tint px-1.5 text-meta text-orange">
                  needs a key
                </span>
              )}
            </div>
            {toolset.description && (
              <p className="mt-0.5 text-meta leading-[1.5] text-ink-3">
                {toolset.description}
              </p>
            )}
            {toolset.tools && toolset.tools.length > 0 && (
              <p className="mt-1 font-mono text-meta leading-[1.6] text-ink-2 [overflow-wrap:anywhere]">
                {toolset.tools.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
