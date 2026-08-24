"use client";

import type { ReactNode } from "react";

/* The three shapes /settings needs, so each section is a list of data rather
 * than a list of hand-built divs. Nothing here is generic beyond that. */

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="pt-5"
      style={{ animation: "fade-up var(--duration-medium) var(--ease-out-strong) both" }}
    >
      <h2 className="px-1 text-meta font-medium tracking-wide text-ink-3 uppercase">
        {title}
      </h2>
      {description && (
        <p className="mt-1 px-1 text-meta leading-snug text-ink-3">{description}</p>
      )}
      <div className="mt-2 overflow-hidden rounded-card bg-surface shadow-card">
        {children}
      </div>
    </section>
  );
}

/** A labelled row. Rows stack inside a section and hairline between themselves. */
export function SettingsRow({
  label,
  hint,
  control,
  stacked = false,
}: {
  label: string;
  hint?: string;
  control: ReactNode;
  /** put the control on its own line — segmented controls need the width */
  stacked?: boolean;
}) {
  return (
    <div
      className={`flex gap-3 border-b border-line px-3 py-2.5 last:border-b-0 ${
        stacked ? "flex-col" : "items-center"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-label font-medium text-ink">{label}</div>
        {hint && <p className="mt-0.5 text-meta leading-snug text-ink-3">{hint}</p>}
      </div>
      <div className={stacked ? "w-full" : "shrink-0"}>{control}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex w-full gap-0.5 rounded-control bg-field p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`h-8 min-w-0 flex-1 truncate rounded-chip px-2 text-label font-medium
              transition-[background-color,color,box-shadow] duration-150 active:scale-[0.98] ${
                active
                  ? "bg-surface text-ink shadow-btn"
                  : "text-ink-3 hover:text-ink-2"
              }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="tap-target relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200
        disabled:opacity-40"
      style={{ background: checked ? "var(--accent)" : "var(--line-strong)" }}
    >
      {/* The knob is --page, not white. --accent is monochrome — near-white in
          dark — so a white knob on a checked track was white on white. --page
          is the one token guaranteed to contrast with it in both themes. */}
      <span
        className="absolute top-0.5 left-0.5 size-5 rounded-full transition-transform duration-200"
        style={{
          background: "var(--page)",
          transform: checked ? "translateX(16px)" : "translateX(0)",
          transitionTimingFunction: "var(--ease-out-strong)",
        }}
      />
    </button>
  );
}

/** A plain action row — the button *is* the row. */
export function SettingsAction({
  label,
  hint,
  actionLabel,
  onAction,
  tone = "default",
  disabled = false,
}: {
  label: string;
  hint?: string;
  actionLabel: string;
  onAction: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <SettingsRow
      label={label}
      hint={hint}
      control={
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className={`h-8 rounded-control border border-line-strong px-3 text-label font-medium
            transition-[background-color,transform] duration-200 enabled:hover:bg-hover
            enabled:active:scale-[0.98] disabled:opacity-40 ${
              tone === "danger" ? "text-red" : "text-ink"
            }`}
        >
          {actionLabel}
        </button>
      }
    />
  );
}
