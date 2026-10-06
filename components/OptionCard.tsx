"use client";

import { useId } from "react";
import { searchUrl } from "@/lib/planStyle";
import type { Option } from "@/lib/schema";

export function OptionCard({
  option,
  selected,
  onSelect,
  onMoreLikeThis,
  note,
}: {
  option: Option;
  selected: boolean;
  onSelect: () => void;
  onMoreLikeThis: () => void;
  /** e.g. "~25 min walk from UWS · 60s–70s" when it's outside a walking night's area. */
  note?: string;
}) {
  const detailsId = useId();
  return (
    <article
      className={`flex flex-col rounded-2xl border transition ${
        selected ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-muted"
      }`}
    >
      {/* The selectable part is a real button; the links below sit outside it. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${option.name}, ${option.category}`}
        aria-describedby={detailsId}
        className="flex w-full flex-col gap-2 rounded-t-2xl p-4 pb-2 text-left"
      >
        <span className="flex w-full items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-display text-lg leading-snug">{option.name}</span>
            <span className="block text-xs text-muted">
              <span className="text-accent">{option.category}</span>
              {option.neighborhood && <> · {option.neighborhood}</>}
              {option.price && <> · {option.price}</>}
            </span>
          </span>
          <span
            className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] ${
              selected ? "border-accent bg-accent text-accent-ink" : "border-line"
            }`}
            aria-hidden
          >
            {selected ? "✓" : ""}
          </span>
        </span>

        <span id={detailsId} className="flex flex-col gap-2">
          {note && (
            <span className="w-fit rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">
              🚶 {note}
            </span>
          )}
          <span className="block text-sm leading-relaxed">{option.why}</span>
          {option.when && <span className="block text-xs text-muted">🕘 {option.when}</span>}
          {option.tip && <span className="block text-xs text-muted">💡 {option.tip}</span>}
        </span>
      </button>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-4 pt-1 text-xs">
        <a
          href={option.url || searchUrl(option.name, option.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted underline underline-offset-4 hover:text-fg"
        >
          {option.url ? "Website ↗" : "Search ↗"}
          <span className="sr-only"> for {option.name} (opens in a new tab)</span>
        </a>
        {option.address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${option.name} ${option.address}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted underline underline-offset-4 hover:text-fg"
          >
            Map ↗<span className="sr-only"> for {option.name} (opens in a new tab)</span>
          </a>
        )}
        <button type="button" onClick={onMoreLikeThis} className="ml-auto text-muted hover:text-accent">
          More like this<span className="sr-only">: {option.name}</span>
        </button>
      </div>
    </article>
  );
}

export function OptionSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line p-4" aria-hidden>
      <div className="skeleton h-5 w-2/3 rounded" />
      <div className="skeleton h-3 w-1/3 rounded" />
      <div className="skeleton h-3 w-full rounded" />
      <div className="skeleton h-3 w-5/6 rounded" />
    </div>
  );
}
