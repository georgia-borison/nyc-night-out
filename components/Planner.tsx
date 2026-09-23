"use client";

import { useState } from "react";
import { NEIGHBORHOODS } from "@/lib/neighborhoods";
import { ACTIVITY_TYPES, BAR_TYPES, CUISINES } from "@/lib/cuisines";
import {
  BUDGETS,
  PIECES,
  type Budget,
  type Itinerary,
  type Option,
  type PieceId,
  type Trip,
} from "@/lib/schema";
import { Chip, ChipGroup, ErrorBox, GhostButton, PrimaryButton, Section } from "./ui";
import { OptionCard, OptionSkeleton } from "./OptionCard";
import { Timeline } from "./Timeline";

type PieceResult = {
  status: "loading" | "done" | "error";
  options: Option[];
  seen: string[];
  error?: string;
};

const STEPS = ["Where", "Vibe", "The night", "Options", "Itinerary"];

const VIBE_IDEAS = [
  "Low-key date night, natural wine, somewhere we can actually talk",
  "Birthday dinner for 6, lively but not a club, then a fun bar",
  "Catching up with an old friend: great cocktails, no lines",
  "Big night out: dinner, a show, then dancing till late",
];

function todayInNY() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function Planner() {
  const [step, setStep] = useState(0);

  const [area, setArea] = useState("");
  const [vibe, setVibe] = useState("");
  const [date, setDate] = useState(todayInNY);
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState(2);
  const [budget, setBudget] = useState<Budget>("$$");
  const [pieces, setPieces] = useState<PieceId[]>(["pre_drinks", "dinner", "post_drinks"]);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [barTypes, setBarTypes] = useState<string[]>([]);
  const [activityTypes, setActivityTypes] = useState<string[]>([]);

  const [results, setResults] = useState<Partial<Record<PieceId, PieceResult>>>({});
  const [picks, setPicks] = useState<Partial<Record<PieceId, Option>>>({});

  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [itinLoading, setItinLoading] = useState(false);
  const [itinError, setItinError] = useState<string | null>(null);
  // Running API cost for this night, shown so searches never surprise you.
  const [spent, setSpent] = useState(0);

  const trip: Trip = { area, vibe, date, time, partySize, budget, cuisines, barTypes, activityTypes };
  const orderedPieces = PIECES.filter((p) => pieces.includes(p.id));
  const showCuisines = pieces.includes("dinner");
  const showBars = pieces.some((p) => p === "pre_drinks" || p === "post_drinks");
  const showActivities = pieces.includes("activity");

  async function fetchPiece(piece: PieceId, hint?: string) {
    const prev = results[piece];
    const seen = prev?.seen ?? [];
    setResults((r) => ({ ...r, [piece]: { status: "loading", options: prev?.options ?? [], seen } }));
    try {
      const data = await postJSON<{ options: Option[]; costUsd: number }>("/api/suggest", {
        ...trip,
        piece,
        otherPieces: pieces,
        // Skip anything already seen here or shown in another section.
        exclude: Array.from(new Set([...seen, ...shownElsewhere(piece)])),
        hint,
      });
      setSpent((c) => c + data.costUsd);
      setResults((r) => {
        let options = data.options;
        const picked = picks[piece];
        if (picked && !options.some((o) => o.name === picked.name)) options = [picked, ...options];
        return {
          ...r,
          [piece]: {
            status: "done",
            options,
            seen: Array.from(new Set([...seen, ...data.options.map((o) => o.name)])),
          },
        };
      });
    } catch (err) {
      setResults((r) => ({
        ...r,
        [piece]: { status: "error", options: prev?.options ?? [], seen, error: (err as Error).message },
      }));
    }
  }

  async function findOptions() {
    setResults(Object.fromEntries(orderedPieces.map((p) => [p.id, { status: "loading", options: [], seen: [] }])));
    setPicks({});
    setItinerary(null);
    setSpent(0);
    setStep(3);
    try {
      // One call covers every part of the night, sharing a few searches.
      const data = await postJSON<{ sections: { piece: PieceId; options: Option[] }[]; costUsd: number }>(
        "/api/night",
        { ...trip, pieces },
      );
      setSpent(data.costUsd);
      setResults(
        Object.fromEntries(
          orderedPieces.map((p) => {
            const options = data.sections.filter((s) => s.piece === p.id).flatMap((s) => s.options);
            return [p.id, { status: "done", options, seen: options.map((o) => o.name) }];
          }),
        ),
      );
    } catch (err) {
      const error = (err as Error).message;
      setResults(Object.fromEntries(orderedPieces.map((p) => [p.id, { status: "error", options: [], seen: [], error }])));
    }
  }

  async function buildItinerary() {
    const chosen = orderedPieces.flatMap((p) => (picks[p.id] ? [{ ...picks[p.id]!, piece: p.id }] : []));
    setStep(4);
    setItinLoading(true);
    setItinError(null);
    setItinerary(null);
    try {
      const data = await postJSON<{ itinerary: Itinerary; costUsd: number }>("/api/itinerary", {
        ...trip,
        picks: chosen,
      });
      setSpent((c) => c + data.costUsd);
      setItinerary(data.itinerary);
    } catch (err) {
      setItinError((err as Error).message);
    } finally {
      setItinLoading(false);
    }
  }

  function shownElsewhere(piece: PieceId) {
    return orderedPieces.flatMap((p) => (p.id === piece ? [] : (results[p.id]?.options ?? []).map((o) => o.name)));
  }

  // Sections search in parallel, so the same venue can come back twice.
  // Show each place only in the first section it appears in, unless it was picked there.
  const visibleOptions: Partial<Record<PieceId, Option[]>> = {};
  const shown = new Set<string>();
  for (const p of orderedPieces) {
    visibleOptions[p.id] = (results[p.id]?.options ?? []).filter((o) => {
      const key = o.name.trim().toLowerCase();
      if (shown.has(key) && picks[p.id]?.name !== o.name) return false;
      shown.add(key);
      return true;
    });
  }

  const pickCount = orderedPieces.filter((p) => picks[p.id]).length;
  const anyLoading = orderedPieces.some((p) => results[p.id]?.status === "loading");

  return (
    <div className="space-y-8">
      <Stepper step={step} onJump={(i) => i < step && setStep(i)} />

      {step === 0 && (
        <div className="space-y-8">
          <Heading title="Where are you headed?" sub="Pick the neighborhood you'll be around tonight." />
          {NEIGHBORHOODS.map((b) => (
            <Section key={b.borough} title={b.borough}>
              <div className="flex flex-wrap gap-2">
                {b.areas.map((a) => (
                  <Chip key={a} selected={area === a} onClick={() => setArea(a)}>
                    {a}
                  </Chip>
                ))}
              </div>
            </Section>
          ))}
          <Section title="Somewhere else" hint="Type a neighborhood, a cross street, or a venue you'll be near.">
            <input
              value={NEIGHBORHOODS.some((b) => b.areas.includes(area)) ? "" : area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="e.g. near Barclays Center, or Surprise me — anywhere in Brooklyn"
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            />
          </Section>
          <Nav onNext={() => setStep(1)} nextDisabled={!area.trim()} />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-8">
          <Heading title="What kind of night?" sub="Describe it however you like. The more specific, the better." />
          <div className="space-y-3">
            <textarea
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Low-key date night, natural wine, nothing too loud, maybe something fun after…"
              className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 leading-relaxed outline-none focus:border-accent"
            />
            <div className="flex flex-wrap gap-2">
              {VIBE_IDEAS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVibe(v)}
                  className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-muted hover:border-muted hover:text-fg"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
              />
            </Field>
            <Field label="Starting around">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
              />
            </Field>
            <Field label="Party size">
              <div className="flex items-center gap-3">
                <StepperButton onClick={() => setPartySize((n) => Math.max(1, n - 1))}>−</StepperButton>
                <span className="w-8 text-center text-lg tabular-nums">{partySize}</span>
                <StepperButton onClick={() => setPartySize((n) => Math.min(30, n + 1))}>+</StepperButton>
              </div>
            </Field>
          </div>

          <Section title="Budget" hint="Per person, roughly.">
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map((b) => (
                <Chip key={b} selected={budget === b} onClick={() => setBudget(b)}>
                  <span className="px-1 tracking-widest">{b}</span>
                </Chip>
              ))}
            </div>
          </Section>

          <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!date || !time} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-8">
          <Heading title="Build the night" sub="Pick the parts you want. You'll get a few options for each." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PIECES.map((p) => {
              const on = pieces.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPieces((ps) => toggle(ps, p.id))}
                  aria-pressed={on}
                  className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition ${
                    on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-muted"
                  }`}
                >
                  <span className="text-2xl">{p.emoji}</span>
                  <span className="font-medium">{p.label}</span>
                </button>
              );
            })}
          </div>

          {showCuisines && (
            <Section title="Cuisines (optional)" hint="Leave blank for a mix.">
              <ChipGroup options={CUISINES} selected={cuisines} onToggle={(c) => setCuisines((l) => toggle(l, c))} />
            </Section>
          )}
          {showBars && (
            <Section title="Bar styles (optional)">
              <ChipGroup options={BAR_TYPES} selected={barTypes} onToggle={(c) => setBarTypes((l) => toggle(l, c))} />
            </Section>
          )}
          {showActivities && (
            <Section title="Activities (optional)">
              <ChipGroup
                options={ACTIVITY_TYPES}
                selected={activityTypes}
                onToggle={(c) => setActivityTypes((l) => toggle(l, c))}
              />
            </Section>
          )}

          <Nav
            onBack={() => setStep(1)}
            onNext={findOptions}
            nextLabel="Find options →"
            nextDisabled={pieces.length === 0}
          />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-10">
          <Heading
            title={`Your night in ${area}`}
            sub="Tap one option for each part of the night. Searching takes a minute, since it's checking what's open and on tonight."
          />
          {orderedPieces.map((p) => {
            const r = results[p.id];
            return (
              <section key={p.id} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-2xl">
                    <span className="mr-2">{p.emoji}</span>
                    {p.label}
                  </h2>
                  {r?.status === "done" && (
                    <button
                      type="button"
                      onClick={() => fetchPiece(p.id)}
                      className="text-sm text-muted hover:text-accent"
                    >
                      ↻ Show different options
                    </button>
                  )}
                </div>
                {r?.status === "loading" && (
                  <p className="text-sm text-muted">
                    Finding {p.short.toLowerCase()} options in {area}…
                  </p>
                )}
                {r?.status === "error" && <ErrorBox message={r.error!} onRetry={() => fetchPiece(p.id)} />}
                <div className="grid gap-3 sm:grid-cols-2">
                  {r?.status === "loading" && r.options.length === 0
                    ? Array.from({ length: 4 }, (_, i) => <OptionSkeleton key={i} />)
                    : visibleOptions[p.id]?.map((o) => (
                        <OptionCard
                          key={o.name}
                          option={o}
                          selected={picks[p.id]?.name === o.name}
                          onSelect={() =>
                            setPicks((cur) => ({ ...cur, [p.id]: cur[p.id]?.name === o.name ? undefined : o }))
                          }
                          onMoreLikeThis={() =>
                            fetchPiece(p.id, `Find more places similar to ${o.name} (${o.category}).`)
                          }
                        />
                      ))}
                </div>
                {r?.status === "done" && !visibleOptions[p.id]?.length && (
                  <p className="text-sm text-muted">Nothing turned up for this one. Try &ldquo;Show different options.&rdquo;</p>
                )}
              </section>
            );
          })}

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/90 p-3 pl-5 backdrop-blur">
            <span className="text-sm text-muted">
              {pickCount} of {orderedPieces.length} picked
              {anyLoading ? " · still searching…" : spent > 0 && ` · about ${spent.toFixed(2)} in API costs so far`}
            </span>
            <div className="flex gap-2">
              <GhostButton onClick={() => setStep(2)}>Edit</GhostButton>
              <PrimaryButton onClick={buildItinerary} disabled={pickCount === 0}>
                Build my night →
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-8">
          {itinLoading && (
            <div className="space-y-4">
              <p className="text-muted">Putting your night in order…</p>
              <OptionSkeleton />
              <OptionSkeleton />
            </div>
          )}
          {itinError && <ErrorBox message={itinError} onRetry={buildItinerary} />}
          {itinerary && (
            <>
              <Timeline itinerary={itinerary} />
              <div className="flex flex-wrap items-center gap-3">
                <GhostButton onClick={() => setStep(3)}>← Change picks</GhostButton>
              </div>
              {spent > 0 && <p className="text-xs text-muted">This plan cost about ${spent.toFixed(2)} in API usage.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <ol className="flex gap-1.5">
      {STEPS.map((s, i) => (
        <li key={s} className="flex-1">
          <button
            type="button"
            onClick={() => onJump(i)}
            disabled={i >= step}
            className="w-full text-left disabled:cursor-default"
          >
            <span className={`block h-1 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />
            <span className={`mt-1.5 hidden text-xs sm:block ${i === step ? "text-fg" : "text-muted"}`}>{s}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-muted">{sub}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}

function StepperButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid size-10 place-items-center rounded-full border border-line text-lg hover:border-muted"
    >
      {children}
    </button>
  );
}

function Nav({
  onBack,
  onNext,
  nextLabel = "Next →",
  nextDisabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      {onBack ? <GhostButton onClick={onBack}>← Back</GhostButton> : <span />}
      <PrimaryButton onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </PrimaryButton>
    </div>
  );
}
