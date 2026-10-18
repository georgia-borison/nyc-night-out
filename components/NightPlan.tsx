"use client";

import { useMemo, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { budgetLabel, type Itinerary, type ItineraryStop, type Trip } from "@/lib/schema";
import {
  KIND_STYLE,
  linkLabel,
  mapsRouteUrl,
  mapsSearchUrl,
  pieceKind,
  reservationLabel,
  reserveLink,
  searchUrl,
  transitIcon,
} from "@/lib/planStyle";
import { clockLabel, parseClock } from "@/lib/timing";
import type { MapStop } from "./PlanMap";

// Leaflet needs the browser, so the map never renders on the server.
const PlanMap = dynamic(() => import("./PlanMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" />,
});

function shortDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** "Tonight" / "Tomorrow" / weekday name, for the ticket-stub line above the title. */
function planDateLabel(date: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (days === 0) return "Tonight";
  if (days === 1) return "Tomorrow";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}

export function NightPlan({ itinerary, trip }: { itinerary: Itinerary; trip: Trip }) {
  const [active, setActive] = useState<number | null>(null);
  const { stops } = itinerary;

  const styled = useMemo(() => stops.map((s) => KIND_STYLE[pieceKind(s.piece)]), [stops]);
  const mapStops = useMemo<MapStop[]>(
    () =>
      stops.flatMap((s, index) =>
        s.lat !== undefined && s.lng !== undefined
          ? [{ index, lat: s.lat, lng: s.lng, name: s.name, color: styled[index].color }]
          : [],
      ),
    [stops, styled],
  );

  function focusStop(i: number) {
    setActive(i);
    document.getElementById(`stop-${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // The date already sits in the line above the title.
  const facts = [
    trip.area,
    `${trip.partySize} ${trip.partySize === 1 ? "person" : "people"}`,
    budgetLabel(trip),
    // Plans saved before the rides setting existed don't say either way.
    trip.rides === true ? "🚕 Short rides OK" : trip.rides === false ? "🚶 Walkable night" : null,
    stops.length > 1 ? `${stops[0].time} → ${stops[stops.length - 1].time}` : stops[0]?.time,
  ].filter(Boolean);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }}
        />
        <p className="plan-rise flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-[0.15em] text-accent sm:tracking-[0.2em]">
          <span aria-hidden>🌙</span>
          <span className="whitespace-nowrap">{planDateLabel(trip.date)}&rsquo;s plan</span>
          <span aria-hidden className="h-px w-6 bg-accent/50 sm:w-8" />
          <span className="whitespace-nowrap text-muted">{shortDate(trip.date)}</span>
        </p>
        <h1
          className="plan-rise mt-3 font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          <span className="text-glow-gradient">{itinerary.title.trim() || "Your Night Out"}</span>
        </h1>
        {itinerary.tagline && (
          <p className="plan-rise mt-2 text-lg text-muted" style={{ animationDelay: "160ms" }}>
            {itinerary.tagline}
          </p>
        )}
        <ul className="mt-5 flex flex-wrap gap-2">
          {facts.map((f) => (
            <li key={f} className="rounded-full border border-line bg-bg/60 px-3 py-1 text-xs text-muted">
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-2xl leading-relaxed text-fg/90">{itinerary.summary}</p>
      </header>

      {/* Night at a glance */}
      <nav aria-label="Stops" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ol className="flex min-w-max items-center">
          {stops.map((s, i) => (
            <li key={i} className="flex items-center">
              {i > 0 && <span aria-hidden className="mx-2 h-px w-6 bg-line sm:w-10" />}
              <button
                type="button"
                onClick={() => focusStop(i)}
                className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-left transition ${
                  active === i ? "border-fg bg-surface-2" : "border-line bg-surface hover:border-muted"
                }`}
              >
                <span
                  className="grid size-7 place-items-center rounded-full text-xs font-bold text-bg"
                  style={{ background: styled[i].color }}
                >
                  {i + 1}
                </span>
                <span className="leading-tight">
                  <span className="block text-[11px] text-muted">
                    {styled[i].emoji} {s.time}
                  </span>
                  <span className="block max-w-[11rem] truncate text-sm font-medium">{s.name}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Map: above the timeline on phones, sticky beside it on desktop */}
        {mapStops.length > 0 && (
          <aside className="lg:order-last">
            <div className="space-y-3 lg:sticky lg:top-4">
              <div className="h-64 overflow-hidden rounded-2xl border border-line sm:h-80 lg:h-[460px]">
                <PlanMap stops={mapStops} active={active} onSelect={focusStop} />
              </div>
              <a
                href={mapsRouteUrl(stops)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-full border border-line py-2.5 text-sm transition hover:border-accent hover:text-accent"
              >
                🧭 Open route in Google Maps ↗
              </a>
            </div>
          </aside>
        )}

        {/* Timeline */}
        <ol className="space-y-0">
          {stops.map((stop, i) => {
            const { color, emoji } = styled[i];
            const isActive = active === i;
            return (
              <li key={i} id={`stop-${i}`} className="scroll-mt-4">
                {i > 0 && <Leg stop={stop} rides={Boolean(trip.rides)} />}
                <article
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setActive(i)}
                  className={`flex gap-3 rounded-2xl border bg-surface p-4 transition sm:gap-5 sm:p-5 ${
                    isActive ? "border-fg/60 shadow-[0_0_0_1px_var(--line)]" : "border-line"
                  }`}
                  style={{ borderTop: `3px solid ${color}` } as CSSProperties}
                >
                  <div className="flex w-14 shrink-0 flex-col items-center gap-2 sm:w-16">
                    <span
                      className="grid size-9 place-items-center rounded-full text-sm font-bold text-bg"
                      style={{ background: color }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-center text-sm font-semibold leading-tight">{stop.time}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>
                      {emoji} {stop.piece}
                      {stop.booked && (
                        <span className="ml-2 rounded-full bg-accent px-2 py-0.5 normal-case tracking-normal text-accent-ink">
                          ✓ Booked
                        </span>
                      )}
                    </p>
                    <h3 className="mt-1 font-display text-2xl font-bold leading-tight tracking-[-0.01em] break-words">{stop.name}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {stop.category}
                      {stop.address && <> · {stop.address}</>}
                    </p>
                    {stop.notes && <p className="mt-3 text-sm leading-relaxed">{stop.notes}</p>}
                    {!stop.booked && reservationLabel(stop) && (
                      <p className="mt-2 text-xs text-muted">{reservationLabel(stop)}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {(() => {
                        // Reserve for the stop's scheduled time, with the night's date and party size.
                        const at = parseClock(stop.time);
                        const reserve =
                          !stop.booked && at ? reserveLink(stop, { date: trip.date, time: at, partySize: trip.partySize }) : null;
                        return (
                          reserve &&
                          at && (
                            <a
                              href={reserve.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-full border border-accent bg-accent-soft px-3 py-1 font-medium text-accent hover:brightness-110"
                            >
                              {reserve.label} · {clockLabel(at)} · {trip.partySize} ↗
                            </a>
                          )
                        );
                      })()}
                      <a
                        href={stop.url || searchUrl(stop.name, stop.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-line px-3 py-1 text-muted hover:border-muted hover:text-fg"
                      >
                        {linkLabel(stop)} ↗
                      </a>
                      <a
                        href={mapsSearchUrl(stop.name, stop.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-line px-3 py-1 text-muted hover:border-muted hover:text-fg"
                      >
                        Map ↗
                      </a>
                      {mapStops.length > 0 && stop.lat === undefined && (
                        <span className="self-center text-muted/70" title="We couldn't place this one precisely">
                          Not on map
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      </div>

      {itinerary.tips.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface-2 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Good to know</h2>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {itinerary.tips.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-accent">✦</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const RIDE = /\b(cab|taxi|uber|lyft|train|subway|bus|ride|ferry)\b/i;
// "about a 15-minute walk", "an easy 10 min stroll", "roughly 12–15 minutes on foot"
const MINUTES =
  /,?\s*(?:(?:about|around|roughly|only|just|approximately)\s+)?(?:an?\s+)?(?:(?:easy|quick|short|brisk|leisurely|pleasant|nice)\s+)?\d+\s*(?:(?:-|–|to)\s*\d+\s*)?-?\s*min(?:ute)?s?(?:\s+(?:walk|stroll|on foot))?/gi;
// Words left hanging once the minutes are gone ("…toward Woodward Ave, about a.").
const DANGLING = /,?\s*\b(?:(?:about|around|roughly|only|just|approximately)(?:\s+an?)?|an?)\s*(?=[.!?]?$)/i;

/**
 * Removes Claude's guessed walking times ("about 12-15 minutes") once the real
 * walk is shown, keeping the directions. Ride times ("a 10-minute cab") stay.
 */
function withoutGuessedMinutes(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    // Within a sentence, "walk ..., or grab a cab ..." parts are handled separately.
    .map((sentence) =>
      sentence
        .split(/(,\s*or\s+|;\s*)/)
        .map((part) => (RIDE.test(part) ? part : part.replace(MINUTES, "").replace(DANGLING, "")))
        .join(""),
    )
    .map((sentence) => sentence.replace(/\s+([.,!?])/g, "$1").replace(/,\s*\./g, ".").trim())
    .filter((sentence) => sentence.replace(/[.!?]/g, "").trim().split(/\s+/).length > 2)
    .join(" ");
}

/** The gap between two stops: the real walk from the map, plus Claude's advice. */
function Leg({ stop, rides }: { stop: ItineraryStop; rides: boolean }) {
  const { walk } = stop;
  // Older plans have Claude's guessed times ("walk about 10-12 minutes"); once the
  // real walk is known, drop advice that states minutes so the two don't disagree.
  const advice = walk ? withoutGuessedMinutes(stop.getting_there) : stop.getting_there;
  let headline = null;
  if (walk) {
    const mins = `${walk.estimated ? "~" : ""}${walk.minutes} min`;
    const miles = `${walk.miles} mi`;
    if (walk.minutes <= (rides ? 20 : 25)) {
      headline = (
        <>
          <span aria-hidden className="text-base">🚶</span>
          <span>
            <strong className="font-semibold text-fg">{mins} walk</strong> · {miles}
          </span>
        </>
      );
    } else if (rides) {
      const icon = advice && transitIcon(advice) !== "🚶" ? transitIcon(advice) : "🚇";
      headline = (
        <>
          <span aria-hidden className="text-base">{icon}</span>
          <span>
            <strong className="font-semibold text-fg">Quick ride</strong> · {mins} on foot ({miles})
          </span>
        </>
      );
    } else {
      headline = (
        <>
          <span aria-hidden className="text-base">🚶</span>
          <span>
            <strong className="font-semibold text-fg">{mins} walk</strong> ({miles}) · a cab or subway is quicker
          </span>
        </>
      );
    }
  }

  return (
    <div className="flex gap-3 py-3 pl-[4.25rem] text-xs text-muted sm:pl-[5.25rem]">
      <span aria-hidden className="-ml-[2.1rem] min-h-8 border-l-2 border-dashed border-line sm:-ml-[2.6rem]" />
      <div className="space-y-1 self-center">
        {headline && <p className="flex items-center gap-2">{headline}</p>}
        {advice && (
          <p className={headline ? "pl-7 text-muted/80" : "flex items-center gap-2"}>
            {!headline && <span aria-hidden className="text-base">{transitIcon(advice)}</span>}
            {advice}
          </p>
        )}
      </div>
    </div>
  );
}
