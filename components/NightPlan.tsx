"use client";

import { useMemo, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import type { Itinerary, Trip } from "@/lib/schema";
import { KIND_STYLE, mapsRouteUrl, mapsSearchUrl, pieceKind, transitIcon } from "@/lib/planStyle";
import type { MapStop } from "./PlanMap";

// Leaflet needs the browser, so the map never renders on the server.
const PlanMap = dynamic(() => import("./PlanMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" />,
});

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
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

  const facts = [
    formatDate(trip.date),
    trip.area,
    `${trip.partySize} ${trip.partySize === 1 ? "person" : "people"}`,
    trip.budget,
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Your night out</p>
        <h1 className="mt-2 font-display text-4xl italic leading-[1.05] sm:text-5xl">{itinerary.title}</h1>
        <ul className="mt-4 flex flex-wrap gap-2">
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
                {i > 0 && (
                  <div className="flex items-center gap-3 py-3 pl-[4.25rem] text-xs text-muted sm:pl-[5.25rem]">
                    <span aria-hidden className="-ml-[2.1rem] h-8 border-l-2 border-dashed border-line sm:-ml-[2.6rem]" />
                    {stop.getting_there && (
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="text-base">{transitIcon(stop.getting_there)}</span>
                        {stop.getting_there}
                      </span>
                    )}
                  </div>
                )}
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
                    </p>
                    <h3 className="mt-1 font-display text-2xl leading-tight">{stop.name}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {stop.category}
                      {stop.address && <> · {stop.address}</>}
                    </p>
                    {stop.notes && <p className="mt-3 text-sm leading-relaxed">{stop.notes}</p>}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {stop.url && (
                        <a
                          href={stop.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-line px-3 py-1 text-muted hover:border-muted hover:text-fg"
                        >
                          Website ↗
                        </a>
                      )}
                      <a
                        href={mapsSearchUrl(stop.name, stop.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-line px-3 py-1 text-muted hover:border-muted hover:text-fg"
                      >
                        Map ↗
                      </a>
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
