"use client";

import { useState } from "react";
import { PIECES, type Booking, type PieceId } from "@/lib/schema";
import { TimeSelect } from "./TimeSelect";
import { Chip, ChipRow, Section } from "./ui";

export type VenueResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  url: string;
  linkKind: Booking["linkKind"];
  type: string;
  piece: PieceId;
  /** The listed neighborhood it's in, for the walking and the rides view. */
  areas: { walk: string | null; ride: string | null };
};

/**
 * "Already have a booking?": find the place you've booked, say which part of
 * the night it is and when, and the rest of the night is planned around it.
 */
export function BookingPicker({
  booking,
  areaLabel,
  onPick,
  onChange,
  onRemove,
}: {
  booking: Booking | null;
  /** Where the night is centered, e.g. "East Village". */
  areaLabel: string;
  onPick: (venue: VenueResult) => void;
  onChange: (booking: Booking) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VenueResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Search failed (${res.status})`);
      setResults(data.venues);
      if (!data.venues.length) setError("Couldn't find an open place by that name. Try adding the street or neighborhood.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  if (booking) {
    return (
      <Section title="Your booking" hint="We'll plan the rest of the night around it.">
        <div className="space-y-4 rounded-2xl border border-accent bg-accent-soft p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-lg font-bold leading-snug">{booking.name}</p>
              <p className="text-xs text-muted">
                {booking.address} · planning around it in <span className="text-fg">{areaLabel}</span>
              </p>
            </div>
            <button type="button" onClick={onRemove} className="text-sm text-muted underline underline-offset-4 hover:text-fg">
              Remove booking
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Which part of the night is it?</p>
            <ChipRow label="Booked part of the night">
              {PIECES.map((p) => (
                <Chip key={p.id} selected={booking.piece === p.id} onClick={() => onChange({ ...booking, piece: p.id })}>
                  {p.emoji} {p.short}
                </Chip>
              ))}
            </ChipRow>
          </div>
          <label className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">Booked for</span>
            <TimeSelect
              value={booking.time}
              onChange={(time) => onChange({ ...booking, time })}
              ariaLabel="Booking time"
              noneLabel="No set time"
            />
            <span className="text-xs text-muted">Optional; we&rsquo;ll fit everything else before and after.</span>
          </label>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Already have a booking?" hint="Got a dinner reservation or tickets? Find the place and we'll plan the rest of the night around it.">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={'e.g. "Mala Project"'}
          aria-label="Name of the place you've booked"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={searching || query.trim().length < 2}
          className="rounded-xl border border-line px-4 text-sm transition hover:border-muted disabled:opacity-40"
        >
          {searching ? "Finding…" : "Find"}
        </button>
      </form>
      {error && <p className="text-sm text-muted">{error}</p>}
      {results && results.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Matching places">
          {results.map((v) => (
            <li key={`${v.name}|${v.address}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(v);
                  setResults(null);
                  setQuery("");
                }}
                className="w-full rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-accent"
              >
                <span className="block font-medium">{v.name}</span>
                <span className="block text-xs text-muted">
                  {v.address.split(",")[0]}
                  {v.areas.walk ? ` · ${v.areas.walk}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
