"use client";

import { useState } from "react";
import { NewProjectDialog } from "@/components/nav/NewProjectDialog";
import { IconPlus, IconSparkle } from "@/components/primitives/icons";

export function EmptyState() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-9 items-center justify-center rounded-control bg-inset text-ink-3 shadow-hairline">
        <IconSparkle size={17} />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-ui font-medium text-ink">No projects yet</span>
        <span className="max-w-xs text-label text-ink-3">
          A project is one durable thread — same conversation next week, next
          month. Start with the thing you keep coming back to.
        </span>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex h-8 items-center gap-1.5 rounded-control px-3 text-label font-medium
          transition-[background-color,transform] duration-200 active:scale-[0.98]"
        style={{ background: "var(--ink)", color: "var(--surface)" }}
      >
        <IconPlus size={14} />
        New project
      </button>

      <NewProjectDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
