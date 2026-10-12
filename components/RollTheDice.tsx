"use client";

import { BUDGETS, type Budget } from "@/lib/schema";

/**
 * "Roll the dice": pick a price range and the app builds a whole night
 * (any neighborhood, any cuisine, any activity). Casino crimson and gold, set
 * apart from the rest of the page.
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
  const gold = "border-dice-gold bg-dice-gold text-dice-ink font-semibold";
  const plain = "border-dice-gold/40 text-dice-text hover:border-dice-gold";
  return (
    <section aria-labelledby="dice-title" className="dice-felt space-y-5 rounded-3xl p-6 text-dice-text">
      <div>
        <h2 id="dice-title" className="flex items-center gap-3 font-logo text-xl uppercase tracking-[0.04em] text-dice-gold">
          <span aria-hidden className={`dice-icon text-3xl ${rolling ? "rolling" : ""}`}>
            🎲
          </span>
          Roll the dice
        </h2>
        <p className="mt-2 text-sm text-dice-muted">
          Set your budget and we&rsquo;ll build the whole night: any neighborhood, any cuisine, any activity.
        </p>
      </div>

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
                className={`rounded-full border px-4 py-1.5 text-sm tracking-widest transition ${on ? gold : plain}`}
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
            className="rounded-xl border border-dice-gold/40 bg-dice-deep/60 px-3 py-2 text-dice-text outline-none focus:border-dice-gold"
          />
        </label>
        <div className="space-y-2">
          <span className="block text-xs font-semibold uppercase tracking-wider text-dice-muted">Party</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Fewer people"
              onClick={() => onPartySize(Math.max(1, partySize - 1))}
              className={`grid size-9 place-items-center rounded-full border ${plain}`}
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
              className={`grid size-9 place-items-center rounded-full border ${plain}`}
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
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
            noDrinks ? "border-dice-gold bg-dice-gold" : "border-dice-gold/40 bg-dice-deep/60"
          }`}
        >
          <span
            aria-hidden
            className={`inline-block size-5 rounded-full shadow transition-transform ${
              noDrinks ? "translate-x-6 bg-dice-ink" : "translate-x-1 bg-dice-muted"
            }`}
          />
        </button>
        <span className="text-sm">
          <span className="font-medium">No drinks tonight</span>
          <span className="block text-xs text-dice-muted">{noDrinks ? "Dinner plus a show or event, no bars." : "Includes one drinks stop."}</span>
        </span>
      </div>

      <button
        type="button"
        onClick={onRoll}
        disabled={rolling || !date}
        className="w-full rounded-full bg-dice-gold px-6 py-3 font-logo text-base uppercase tracking-[0.06em] text-dice-ink transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
      >
        {rolling ? "Rolling…" : "Roll the dice"}
      </button>
    </section>
  );
}
