"use client";

import { useId, useState } from "react";
import { BUDGETS, type Budget } from "@/lib/schema";

/**
 * "Roll the dice": an optional shortcut. It starts as one compact row so it
 * doesn't read as a step you must complete; opening it shows the few choices
 * (budget, date, party, no drinks) and the app builds a whole night: any
 * neighborhood, any cuisine, any activity.
 */
export function RollTheDice({
  budgets,
  onToggleBudget,
  date,
  onDate,
  partySize,
  onPartySize,
  noDrinks,
  onNoDrinks,
  rolling,
  onRoll,
}: {
  budgets: Budget[];
  onToggleBudget: (b: Budget) => void;
  date: string;
  onDate: (date: string) => void;
  partySize: number;
  onPartySize: (n: number) => void;
  noDrinks: boolean;
  onNoDrinks: (on: boolean) => void;
  rolling: boolean;
  onRoll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const brass = "border-dice-gold bg-dice-gold text-dice-ink font-semibold";
  const plain = "border-dice-gold/35 text-dice-text hover:border-dice-gold/70";
  return (
    <section aria-labelledby={`${panelId}-title`} className="dice-felt space-y-4 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${panelId}-title`} className="flex items-center gap-2 font-logo text-sm uppercase tracking-[0.05em] text-dice-gold">
            <span aria-hidden className={`dice-icon text-lg ${rolling ? "rolling" : ""}`}>
              🎲
            </span>
            Roll the dice
          </h2>
          <p className="mt-1 text-sm text-dice-muted">Not sure where? We&rsquo;ll plan the whole night for you.</p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className={`rounded-full border px-4 py-1.5 text-sm transition ${plain}`}
        >
          {open ? "Hide" : "Try it"} <span aria-hidden>{open ? "▴" : "▾"}</span>
        </button>
      </div>

      {open && (
        <div id={panelId} className="space-y-4 border-t border-dice-gold/20 pt-4 text-dice-text">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-dice-muted">Budget</p>
            <div role="group" aria-label="Roll the dice budget" className="flex flex-wrap gap-2">
              {BUDGETS.map((b) => {
                const on = budgets.includes(b);
                return (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggleBudget(b)}
                    className={`rounded-full border px-3.5 py-1 text-sm tracking-widest transition ${on ? brass : plain}`}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-wider text-dice-muted">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => onDate(e.target.value)}
                className="rounded-xl border border-dice-gold/35 bg-dice-deep/70 px-3 py-1.5 text-dice-text outline-none focus:border-dice-gold"
              />
            </label>
            <div className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-wider text-dice-muted">Party</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Fewer people"
                  onClick={() => onPartySize(Math.max(1, partySize - 1))}
                  className={`grid size-8 place-items-center rounded-full border ${plain}`}
                >
                  −
                </button>
                <span className="w-6 text-center tabular-nums" aria-live="polite">
                  {partySize}
                </span>
                <button
                  type="button"
                  aria-label="More people"
                  onClick={() => onPartySize(Math.min(30, partySize + 1))}
                  className={`grid size-8 place-items-center rounded-full border ${plain}`}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={noDrinks}
              aria-label="No drinks tonight"
              onClick={() => onNoDrinks(!noDrinks)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                noDrinks ? "border-dice-gold bg-dice-gold" : "border-dice-gold/35 bg-dice-deep/70"
              }`}
            >
              <span
                aria-hidden
                className={`inline-block size-4 rounded-full shadow transition-transform ${
                  noDrinks ? "translate-x-6 bg-dice-ink" : "translate-x-1 bg-dice-muted"
                }`}
              />
            </button>
            <span className="text-sm">
              <span className="font-medium">No drinks tonight</span>
              <span className="block text-xs text-dice-muted">
                {noDrinks ? "Dinner plus a show or event, no bars." : "Includes one drinks stop."}
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={onRoll}
            disabled={rolling || !date}
            className="rounded-full bg-dice-gold px-5 py-2 text-sm font-semibold text-dice-ink transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
          >
            {rolling ? "Rolling…" : "🎲 Roll"}
          </button>
        </div>
      )}
    </section>
  );
}
