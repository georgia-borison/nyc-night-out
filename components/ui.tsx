"use client";

import type { ReactNode } from "react";
import { useRovingFocus } from "@/lib/useRovingFocus";

export function Chip({
  selected,
  onClick,
  children,
  highlighted = false,
  onHoverChange,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Lit up because its shape is hovered on the map. */
  highlighted?: boolean;
  /** Reports hover and keyboard focus, so the map can light up the matching shape. */
  onHoverChange?: (hovering: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      onMouseEnter={onHoverChange && (() => onHoverChange(true))}
      onMouseLeave={onHoverChange && (() => onHoverChange(false))}
      onFocus={onHoverChange && (() => onHoverChange(true))}
      onBlur={onHoverChange && (() => onHoverChange(false))}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
        selected
          ? "border-accent bg-accent text-accent-ink font-medium"
          : highlighted
            ? "-translate-y-0.5 border-accent bg-accent-soft text-fg shadow-[0_4px_14px_rgba(224,60,200,0.3)]"
            : "border-line bg-surface text-fg hover:border-muted"
      }`}
    >
      {children}
    </button>
  );
}

/** A labeled row of buttons: one Tab stop, arrow keys move between them. */
export function ChipRow({ label, children, className = "flex flex-wrap gap-2" }: { label: string; children: ReactNode; className?: string }) {
  const { ref, onKeyDown } = useRovingFocus<HTMLDivElement>();
  return (
    <div ref={ref} role="group" aria-label={label} onKeyDown={onKeyDown} className={className}>
      {children}
    </div>
  );
}

export function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}) {
  return (
    <ChipRow label={label}>
      {options.map((o) => (
        <Chip key={o} selected={selected.includes(o)} onClick={() => onToggle(o)}>
          {o}
        </Chip>
      ))}
    </ChipRow>
  );
}

/** An on/off switch with a label and a line describing the current mode. */
export function Switch({
  checked,
  onChange,
  label,
  onText,
  offText,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  onText: ReactNode;
  offText: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-4">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
          checked ? "border-accent bg-accent" : "border-line bg-surface-2"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block size-5 rounded-full shadow transition-transform ${
            checked ? "translate-x-6 bg-accent-ink" : "translate-x-1 bg-muted"
          }`}
        />
      </button>
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 text-sm text-muted" aria-live="polite">
          {checked ? onText : offText}
        </p>
      </div>
    </div>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted/80">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-line px-5 py-3 text-sm text-fg transition hover:border-muted"
    >
      {children}
    </button>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  );
}
