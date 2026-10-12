"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { itineraryPhrases, searchPhrases } from "@/lib/loadingPhrases";
import Link from "next/link";
import { rememberPlan } from "@/lib/myPlans";
import { areaInfo, isListedArea, visibleAreas } from "@/lib/neighborhoods";
import { ACTIVITY_TYPES, BAR_TYPES, CUISINES } from "@/lib/cuisines";
import {
  BUDGETS,
  PIECES,
  budgetLabel,
  type Booking,
  type Budget,
  type Itinerary,
  type NightEvent,
  type Option,
  type PieceId,
  type Trip,
} from "@/lib/schema";
import { milesBetween } from "@/lib/walk";
import dynamic from "next/dynamic";
import { Chip, ChipGroup, ChipRow, ErrorBox, GhostButton, PrimaryButton, Section, Switch } from "./ui";
import { OptionCard, OptionSkeleton } from "./OptionCard";
import { BookingPicker, type VenueResult } from "./BookingPicker";
import { TimeSelect } from "./TimeSelect";
import { OFFSET, clockLabel, plannedClock } from "@/lib/timing";
import { LoadingShow } from "./LoadingShow";
import { NightPlan } from "./NightPlan";

type PieceResult = {
  status: "loading" | "done" | "error";
  options: Option[];
  seen: string[];
  error?: string;
  /** e.g. "Not much nearby matches your filters, so these are the closest." */
  note?: string;
  /** Too few good options so far; more nearby spots are being found. */
  toppingUp?: boolean;
};

const STEPS = ["Area", "Vibe", "Night", "Picks", "Plan"];

// Leaflet needs the browser, so the area map never renders on the server.
const AreaMap = dynamic(() => import("./AreaMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" />,
});

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
  // Every budget level picked, in any combination ($ and $$$ without $$ is fine).
  const [budgets, setBudgets] = useState<Budget[]>(["$$"]);
  const budget = budgets[0];
  const [pieces, setPieces] = useState<PieceId[]>(["pre_drinks", "dinner", "activity"]);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [barTypes, setBarTypes] = useState<string[]>([]);
  const [activityTypes, setActivityTypes] = useState<string[]>([]);
  // OK with a quick cab or subway ride between stops; otherwise a walking night.
  const [rides, setRides] = useState(false);
  // A place already booked (e.g. a dinner reservation); the rest of the night is planned around it.
  const [booked, setBooked] = useState<Booking | null>(null);
  const [bookedAreas, setBookedAreas] = useState<VenueResult["areas"]>({ walk: null, ride: null });
  // Map lookups for picked venues, started the moment they're picked.
  const locating = useRef(new Map<string, Promise<{ lat: number; lng: number } | null>>());
  // Escape on the area map hands focus back to the list (the selected chip, else the first).
  const areaListRef = useRef<HTMLDivElement>(null);
  // The area under the pointer (on the map or the list), so both light up together.
  const [hoveredArea, setHoveredArea] = useState<string | null>(null);
  const focusAreaList = () => {
    const list = areaListRef.current;
    (list?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? list?.querySelector("button"))?.focus();
  };

  const [results, setResults] = useState<Partial<Record<PieceId, PieceResult>>>({});
  const [picks, setPicks] = useState<Partial<Record<PieceId, Option>>>({});

  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [itinLoading, setItinLoading] = useState(false);
  const [itinError, setItinError] = useState<string | null>(null);
  // Running API cost for this night, shown so searches never surprise you.
  const [spent, setSpent] = useState(0);
  // Latest web search Claude ran, shown while the night is loading.
  // Loading card: when the current wait started, and the latest real progress to flash.
  const [waitStarted, setWaitStarted] = useState(0);
  const [flash, setFlash] = useState<{ text: string; key: number } | null>(null);
  const showProgress = (text: string) => setFlash({ text, key: Date.now() + Math.random() });
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const trip: Trip = {
    area, vibe, date, time, partySize, budget, budgets, cuisines, barTypes, activityTypes, rides,
    booked: booked ?? undefined,
  };

  // ---- A booking sets the area and fixes one part of the night ----

  const bookingArea = (areas: VenueResult["areas"], withRides: boolean, name: string) =>
    (withRides ? areas.ride : areas.walk) ?? `Near ${name}`;

  function pickBooking(v: VenueResult) {
    const b: Booking = {
      piece: v.piece, name: v.name, address: v.address, lat: v.lat, lng: v.lng,
      url: v.url, linkKind: v.linkKind, time: "", category: v.type || "Booked",
    };
    setBooked(b);
    setBookedAreas(v.areas);
    setArea(bookingArea(v.areas, rides, v.name));
    setPieces((ps) => (ps.includes(b.piece) ? ps : [...ps, b.piece]));
  }

  function changeBooking(next: Booking) {
    setBooked(next);
    setPieces((ps) => (ps.includes(next.piece) ? ps : [...ps, next.piece]));
    // Start the night so the parts before the booking fit (an hour of drinks before a 7:30 dinner).
    if (next.time) {
      const [h, m] = next.time.split(":").map(Number);
      const start = h * 60 + m - OFFSET[next.piece];
      if (start >= 0) setTime(`${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`);
    }
  }

  function removeBooking() {
    setBooked(null);
    setArea("");
  }

  /** Choosing a neighborhood instead means the night isn't centered on a booking any more. */
  function selectArea(name: string) {
    if (booked) setBooked(null);
    setArea(name);
  }

  /** The booked part as an option: shown first and already picked. */
  const bookedOption = (b: Booking): Option => ({
    name: b.name,
    category: b.category,
    neighborhood: area,
    address: b.address,
    price: "",
    why: "Your booking. Everything else is planned around it.",
    tip: b.time ? `Booked for ${clockLabel(b.time)}.` : "Already booked.",
    when: "",
    url: b.url,
    linkKind: b.linkKind,
    lat: b.lat,
    lng: b.lng,
    booked: true,
  });

  // Each level toggles on its own; at least one stays picked.
  function toggleBudget(b: Budget) {
    setBudgets((cur) => {
      const next = cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b];
      return next.length ? BUDGETS.filter((x) => next.includes(x)) : cur;
    });
  }

  function toggleRides(next: boolean) {
    setRides(next);
    if (booked) {
      setArea(bookingArea(bookedAreas, next, booked.name));
      return;
    }
    const info = areaInfo(area);
    if (!info) return; // typed-in areas stay as they are
    // Rides on: a walkable part becomes its whole area. Rides off: a whole area must be narrowed down.
    if (next && info.parent) setArea(info.parent);
    if (!next && info.parts) setArea("");
  }

  const venueKey = (o: Option) => `${o.name}|${o.address}`;

  // Start the map lookup as soon as an option is picked, so building the
  // itinerary doesn't wait on it.
  function locate(o: Option) {
    const key = venueKey(o);
    if (locating.current.has(key)) return;
    locating.current.set(
      key,
      postJSON<{ lat: number | null; lng: number | null }>("/api/locate", { name: o.name, address: o.address, area })
        .then((r) => (r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : null))
        .catch(() => null),
    );
  }

  // Vetted options arrive with coordinates: remember them so picking one needs no lookup.
  function seedLocations(options: Option[]) {
    for (const o of options) {
      const key = venueKey(o);
      if (o.lat !== undefined && o.lng !== undefined && !locating.current.has(key)) {
        locating.current.set(key, Promise.resolve({ lat: o.lat, lng: o.lng }));
      }
    }
  }

  // On a walking night, flag options that ended up well outside the chosen area.
  function walkNote(o: Option): string | undefined {
    const center = booked ?? areaInfo(area);
    if (rides || o.booked || !center || o.lat === undefined || o.lng === undefined) return undefined;
    // Straight-line distance, plus ~30% for the street grid, at 20 minutes a mile.
    const minutes = milesBetween(center, { lat: o.lat, lng: o.lng }) * 1.3 * 20;
    if (minutes <= 15) return undefined;
    return `~${Math.round(minutes / 5) * 5} min walk from ${booked ? booked.name : area}`;
  }

  const orderedPieces = PIECES.filter((p) => pieces.includes(p.id));
  const showCuisines = pieces.includes("dinner");
  const showBars = pieces.some((p) => p === "pre_drinks" || p === "post_drinks");
  const showActivities = pieces.includes("activity");

  async function fetchPiece(piece: PieceId, hint?: string) {
    const prev = results[piece];
    const seen = prev?.seen ?? [];
    setResults((r) => ({ ...r, [piece]: { status: "loading", options: prev?.options ?? [], seen } }));
    try {
      const data = await postJSON<{ options: Option[]; note?: string; costUsd: number }>("/api/suggest", {
        ...trip,
        piece,
        otherPieces: pieces,
        // Skip anything already seen here or shown in another section.
        exclude: Array.from(new Set([...seen, ...shownElsewhere(piece)])).slice(-40),
        // "Show different options" should bring new kinds of places, not just new names.
        avoidCategories: hint ? [] : Array.from(new Set((prev?.options ?? []).map((o) => o.category))).slice(0, 20),
        hint,
      });
      setSpent((c) => c + data.costUsd);
      // Check the new options' websites in the background.
      seedLocations(data.options);
      setResults((r) => {
        let options = data.options;
        const picked = picks[piece];
        if (picked && !options.some((o) => o.name === picked.name)) options = [picked, ...options];
        return {
          ...r,
          [piece]: {
            status: "done",
            options,
            note: data.note,
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
    setResults(
      Object.fromEntries(
        orderedPieces.map((p) =>
          booked?.piece === p.id
            ? [p.id, { status: "done", options: [bookedOption(booked)], seen: [booked.name] }]
            : [p.id, { status: "loading", options: [], seen: [] }],
        ),
      ),
    );
    setPicks(booked ? { [booked.piece]: bookedOption(booked) } : {});
    setItinerary(null);
    setSavedId(null);
    setSpent(0);
    setFlash(null);
    setWaitStarted(Date.now());
    setStep(3);

    const fail = (error: string) =>
      setResults((r) =>
        Object.fromEntries(
          orderedPieces.map((p) => {
            const cur = r[p.id];
            // Sections that already arrived keep their options.
            return [p.id, cur?.status === "done" ? { ...cur, toppingUp: false } : { status: "error", options: [], seen: [], error }];
          }),
        ),
      );

    try {
      // One call covers every part of the night. It streams one JSON event per
      // line: each search as it runs, then each section as soon as it's written.
      const res = await fetch("/api/night", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...trip, pieces }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as NightEvent;
          if (event.type === "search") showProgress(`🔎 Searching: ${event.query}`);
          else if (event.type === "section") {
            seedLocations(event.options);
            const label = PIECES.find((x) => x.id === event.piece)?.short ?? "That part";
            showProgress(`✓ ${label} sorted`);
            setResults((r) => ({
              ...r,
              [event.piece]: {
                status: "done",
                options: event.options,
                note: event.note,
                seen: Array.from(new Set([...(r[event.piece]?.seen ?? []), ...event.options.map((o) => o.name)])),
              },
            }));
          } else if (event.type === "topup") {
            const label = PIECES.find((x) => x.id === event.piece)?.short.toLowerCase() ?? "more";
            showProgress(`🔁 Swapping in ${rides ? "better" : "closer"} ${label} spots…`);
            setResults((r) => ({
              ...r,
              [event.piece]: { ...(r[event.piece] ?? { status: "loading", options: [], seen: [] }), toppingUp: true },
            }));
          }
          else if (event.type === "done") {
            setSpent(event.costUsd);
            finished = true;
          } else if (event.type === "error") {
            fail(event.error);
            finished = true;
          }
        }
      }
      if (!finished) fail("The connection dropped before the search finished. Please try again.");
    } catch (err) {
      fail((err as Error).message);
    } finally {
    }
  }

  async function buildItinerary() {
    const picked = orderedPieces.flatMap((p) => (picks[p.id] ? [{ ...picks[p.id]!, piece: p.id }] : []));
    setWaitStarted(Date.now());
    setStep(4);
    setItinLoading(true);
    setItinError(null);
    setItinerary(null);
    setSavedId(null);
    try {
      // Coordinates were looked up while choosing; these are almost always ready.
      const chosen = await Promise.all(
        picked.map(async (o) => {
          locate(o);
          const point = await locating.current.get(venueKey(o));
          return point ? { ...o, ...point } : o;
        }),
      );
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

  async function save() {
    if (!itinerary) return;
    setSaving(true);
    setItinError(null);
    try {
      const { id } = await postJSON<{ id: string }>("/api/plans", { trip, itinerary });
      rememberPlan({ id, title: itinerary.title, date, area, savedAt: new Date().toISOString() });
      setSavedId(id);
    } catch (err) {
      setItinError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!savedId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/plan/${savedId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the saved plan page has the link too.
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
  const anyLoading = orderedPieces.some((p) => results[p.id]?.status === "loading" || results[p.id]?.toppingUp);
  const phrases = useMemo(
    () => searchPhrases({ area, budget: budgetLabel({ budget, budgets }), pieces, rides }),
    // A fresh shuffle for each search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [waitStarted],
  );
  const planPhrases = useMemo(() => itineraryPhrases(), []);

  // The browser tab shows progress, so it's visible while you're in other tabs.
  const busy = (step === 3 && anyLoading) || (step === 4 && itinLoading);
  const wasBusy = useRef(false);
  useEffect(() => {
    const base = "Night Out · NYC";
    if (busy) document.title = step === 3 ? "⏳ Finding your night… · Night Out" : "⏳ Building your plan… · Night Out";
    else if (wasBusy.current) document.title = step === 3 ? "✓ Your options are ready · Night Out" : "✓ Your plan is ready · Night Out";
    else document.title = base;
    wasBusy.current = busy;
  }, [busy, step]);

  return (
    <div className={`space-y-8 ${step < 4 ? "mx-auto max-w-4xl" : ""}`}>
      <Stepper step={step} onJump={(i) => i < step && setStep(i)} />

      {step === 0 && (
        <div className="space-y-8">
          <Heading title="Where are you headed?" sub="Pick the neighborhood you'll be around tonight, or start from a place you've already booked." />
          <BookingPicker
            booking={booked}
            areaLabel={area}
            onPick={pickBooking}
            onChange={changeBooking}
            onRemove={removeBooking}
          />
          <Switch
            checked={rides}
            onChange={toggleRides}
            label="Short cab or subway rides between stops"
            onText={
              <>
                <strong className="font-semibold text-fg">On:</strong> whole neighborhoods, quick rides OK
              </>
            }
            offText={
              <>
                <strong className="font-semibold text-fg">Off:</strong> walking only, so big neighborhoods are split
                into smaller pieces
              </>
            }
          />
          <figure className="space-y-2">
            <div
              role="region"
              aria-label="Neighborhood map (optional; the same choices are in the list below)"
              className="h-[260px] overflow-hidden rounded-2xl border border-line sm:h-[360px]"
            >
              <AreaMap
                selected={area}
                hovered={hoveredArea}
                rides={rides}
                onSelect={selectArea}
                onHover={setHoveredArea}
                onEscape={focusAreaList}
              />
            </div>
            <figcaption className="text-xs text-muted">
              Tap a neighborhood on the map, or choose from the list.
            </figcaption>
          </figure>
          <div ref={areaListRef} className="space-y-8">
            {visibleAreas(rides).map((b) => (
              <Section key={b.borough} title={b.borough}>
                <ChipRow label={`${b.borough} neighborhoods`}>
                  {b.areas.map((a) => (
                    <Chip
                      key={a.name}
                      selected={!booked && area === a.name}
                      onClick={() => selectArea(a.name)}
                      highlighted={hoveredArea === a.name}
                      onHoverChange={(on) => setHoveredArea((h) => (on ? a.name : h === a.name ? null : h))}
                    >
                      {a.name}
                    </Chip>
                  ))}
                </ChipRow>
              </Section>
            ))}
          </div>
          <Section title="Somewhere else" hint="Type a neighborhood, a cross street, or a venue you'll be near.">
            <input
              value={isListedArea(area) || booked ? "" : area}
              onChange={(e) => selectArea(e.target.value)}
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
              <TimeSelect value={time} onChange={setTime} className="w-full py-2.5" />
            </Field>
            <Field label="Party size">
              <div className="flex items-center gap-3">
                <StepperButton label="Fewer people" onClick={() => setPartySize((n) => Math.max(1, n - 1))}>−</StepperButton>
                <span className="w-8 text-center text-lg tabular-nums" aria-live="polite">{partySize}</span>
                <StepperButton label="More people" onClick={() => setPartySize((n) => Math.min(30, n + 1))}>+</StepperButton>
              </div>
            </Field>
          </div>

          <Section
            title="Budget"
            hint="Per person. Pick as many as you like."
          >
            <ChipRow label="Budget">
              {BUDGETS.map((b) => (
                <Chip key={b} selected={budgets.includes(b)} onClick={() => toggleBudget(b)}>
                  <span className="px-1 tracking-widest">{b}</span>
                </Chip>
              ))}
            </ChipRow>
          </Section>

          <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!date || !time} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-8">
          <Heading title="Build the night" sub="Pick the parts you want. You'll get a few options for each." />
          <ChipRow label="Parts of the night" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PIECES.map((p) => {
              const on = pieces.includes(p.id);
              const isBooked = booked?.piece === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => !isBooked && setPieces((ps) => toggle(ps, p.id))}
                  aria-pressed={on}
                  className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition ${
                    on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-muted"
                  }`}
                >
                  <span aria-hidden className="text-2xl">{p.emoji}</span>
                  <span className="font-medium">{p.label}</span>
                  {isBooked && <span className="text-xs text-accent">Booked: {booked.name}</span>}
                </button>
              );
            })}
          </ChipRow>

          {showCuisines && (
            <Section title="Cuisines (optional)" hint="Leave blank for a mix.">
              <ChipGroup label="Cuisines" options={CUISINES} selected={cuisines} onToggle={(c) => setCuisines((l) => toggle(l, c))} />
            </Section>
          )}
          {showBars && (
            <Section title="Bar styles (optional)">
              <ChipGroup label="Bar styles" options={BAR_TYPES} selected={barTypes} onToggle={(c) => setBarTypes((l) => toggle(l, c))} />
            </Section>
          )}
          {showActivities && (
            <Section title="Activities (optional)">
              <ChipGroup
                label="Activities"
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
            title={booked ? `Your night around ${booked.name}` : `Your night in ${area}`}
            sub="Tap one option for each part of the night. We check that every spot is real, open, close by and on budget."
          />
          {anyLoading && (
            <LoadingShow phrases={phrases} flash={flash} startedAt={waitStarted} expected="Usually under a minute" />
          )}
          {orderedPieces.map((p) => {
            const r = results[p.id];
            return (
              <section key={p.id} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-2xl">
                    <span className="mr-2">{p.emoji}</span>
                    {p.label}
                  </h2>
                  {r?.status === "done" && booked?.piece !== p.id && (
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
                {r?.toppingUp && (
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <span aria-hidden className="size-2 animate-pulse rounded-full bg-accent" />
                    Some picks were too far or didn&rsquo;t check out, so we&rsquo;re finding closer spots…
                  </p>
                )}
                {r?.note && !r.toppingUp && <p className="text-sm text-muted">📍 {r.note}</p>}
                {r?.status === "error" && <ErrorBox message={r.error!} onRetry={() => fetchPiece(p.id)} />}
                <div className="grid gap-3 sm:grid-cols-2">
                  {r?.status === "loading" && r.options.length === 0
                    ? Array.from({ length: 4 }, (_, i) => <OptionSkeleton key={i} />)
                    : visibleOptions[p.id]?.map((o) => (
                        <OptionCard
                          key={o.name}
                          option={o}
                          selected={picks[p.id]?.name === o.name}
                          note={walkNote(o)}
                          reserveWhen={{ date, time: plannedClock(p.id, { ...trip, otherPieces: pieces }), partySize }}
                          onSelect={() =>
                            !o.booked &&
                            setPicks((cur) => {
                              const unpick = cur[p.id]?.name === o.name;
                              if (!unpick) locate(o);
                              return { ...cur, [p.id]: unpick ? undefined : o };
                            })
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
              {anyLoading ? " · still searching…" : spent > 0 && ` · about $${spent.toFixed(2)} in API costs so far`}
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
              <LoadingShow phrases={planPhrases} flash={null} startedAt={waitStarted} expected="Usually under a minute" />
              <OptionSkeleton />
              <OptionSkeleton />
            </div>
          )}
          {itinError && <ErrorBox message={itinError} onRetry={itinerary ? save : buildItinerary} />}
          {itinerary && (
            <>
              <NightPlan itinerary={itinerary} trip={trip} />
              <div className="flex flex-wrap items-center gap-3">
                {savedId ? (
                  <>
                    <PrimaryButton onClick={copyLink}>{copied ? "Link copied ✓" : "Copy share link"}</PrimaryButton>
                    <Link href={`/plan/${savedId}`} className="text-sm text-muted underline underline-offset-4">
                      Open saved plan
                    </Link>
                  </>
                ) : (
                  <PrimaryButton onClick={save} disabled={saving}>
                    {saving ? "Saving…" : "Save & get a share link"}
                  </PrimaryButton>
                )}
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

/** Progress through the steps: done steps are buttons that jump back; later ones are just labels. */
function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <nav aria-label="Progress">
      <ol className="flex gap-2">
        {STEPS.map((s, i) => {
          const bar = <span aria-hidden className={`block h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />;
          const text = `mt-2 block text-sm font-semibold ${i === step ? "text-fg" : i < step ? "text-accent" : "text-muted/60"}`;
          return (
            <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
              {i < step ? (
                <button
                  type="button"
                  onClick={() => onJump(i)}
                  aria-label={`Back to ${s}`}
                  className="group w-full rounded text-left"
                >
                  {bar}
                  <span className={`${text} group-hover:text-fg`}>{s}</span>
                </button>
              ) : (
                <div>
                  {bar}
                  <span className={text}>{s}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
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

function StepperButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
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
