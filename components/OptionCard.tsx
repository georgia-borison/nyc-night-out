"use client";

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
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={selected}
      className={`group flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 text-left transition ${
        selected ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-muted"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-snug">{option.name}</h3>
          <p className="text-xs text-muted">
            <span className="text-accent">{option.category}</span>
            {option.neighborhood && <> · {option.neighborhood}</>}
            {option.price && <> · {option.price}</>}
          </p>
        </div>
        <span
          className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] ${
            selected ? "border-accent bg-accent text-accent-ink" : "border-line"
          }`}
          aria-hidden
        >
          {selected ? "✓" : ""}
        </span>
      </div>

      {note && (
        <p className="w-fit rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">🚶 {note}</p>
      )}
      <p className="text-sm leading-relaxed">{option.why}</p>
      {option.when && <p className="text-xs text-muted">🕘 {option.when}</p>}
      {option.tip && <p className="text-xs text-muted">💡 {option.tip}</p>}

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs">
        <a
          href={option.url || searchUrl(option.name, option.address)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-muted underline underline-offset-4 hover:text-fg"
        >
          {option.url ? "Website ↗" : "Search ↗"}
        </a>
        {option.address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${option.name} ${option.address}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted underline underline-offset-4 hover:text-fg"
          >
            Map ↗
          </a>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMoreLikeThis();
          }}
          className="ml-auto text-muted hover:text-accent"
        >
          More like this
        </button>
      </div>
    </div>
  );
}

export function OptionSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
      <div className="skeleton h-5 w-2/3 rounded" />
      <div className="skeleton h-3 w-1/3 rounded" />
      <div className="skeleton h-3 w-full rounded" />
      <div className="skeleton h-3 w-5/6 rounded" />
    </div>
  );
}
