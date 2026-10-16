"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// A sample night that plays itself: each stage lights up its photos in the grid.
const STAGES = [
  { time: "6:30 PM", label: "Drinks" },
  { time: "7:30 PM", label: "Dinner" },
  { time: "9:00 PM", label: "A show" },
  { time: "10:30 PM", label: "Nightcap" },
  { time: "11:45 PM", label: "Dancing" },
] as const;

type Tile = { src: string; stage: number | null };

const P = "/images/pieces/";
const L = "/images/landing/";
// Columns of the tilted grid; each scrolls endlessly (the list is drawn twice).
const COLUMNS: Tile[][] = [
  [
    { src: `${P}pre-drinks-2.jpg`, stage: 0 },
    { src: `${L}pasta.jpg`, stage: 1 },
    { src: `${L}street-night.jpg`, stage: null },
    { src: `${P}events.jpg`, stage: 2 },
    { src: `${P}post-drinks.png`, stage: 3 },
  ],
  [
    { src: `${P}dinner-2.jpg`, stage: 1 },
    { src: `${L}mic.jpg`, stage: 2 },
    { src: `${P}dancing-2.jpg`, stage: 4 },
    { src: `${L}cheers.jpg`, stage: 0 },
    { src: `${L}street-neon.jpg`, stage: null },
  ],
  [
    { src: `${P}activity-2.jpg`, stage: 2 },
    { src: `${L}cheers.jpg`, stage: 0 },
    { src: `${P}post-drinks.png`, stage: 3 },
    { src: `${L}pasta.jpg`, stage: 1 },
    { src: `${P}dancing-2.jpg`, stage: 4 },
  ],
  [
    { src: `${L}street-neon.jpg`, stage: null },
    { src: `${P}dancing-2.jpg`, stage: 4 },
    { src: `${P}pre-drinks-2.jpg`, stage: 0 },
    { src: `${L}mic.jpg`, stage: 2 },
    { src: `${P}dinner-2.jpg`, stage: 1 },
  ],
];

const STEP_MS = 2600;

/**
 * The home page: a tilted wall of night-out photos drifting behind the title,
 * with a sample itinerary that steps through drinks, dinner, a show, a
 * nightcap and dancing, lighting up the matching photos as it goes. "Plan my
 * night" opens into the planner.
 */
export function Landing() {
  const router = useRouter();
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const still = paused || reduceMotion;
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setStage((s) => (s + 1) % STAGES.length), STEP_MS);
    return () => clearInterval(id);
  }, [still]);

  // Open into the planner: the photo wall zooms past, then the planner loads.
  function open(href: string) {
    return (e: React.MouseEvent) => {
      if (reduceMotion || e.metaKey || e.ctrlKey || e.shiftKey) return; // plain navigation
      e.preventDefault();
      setLeaving(true);
      window.setTimeout(() => router.push(href), 450);
    };
  }

  return (
    <section
      aria-labelledby="landing-title"
      className="relative left-1/2 -mt-2 flex min-h-[calc(100svh-5.5rem)] w-screen -translate-x-1/2 items-center justify-center overflow-hidden"
    >
      {/* The drifting, tilted photo wall (decorative). */}
      <div
        aria-hidden
        className={`landing-wall absolute inset-[-30%] flex rotate-[-14deg] justify-center gap-4 transition duration-500 ease-in ${
          leaving ? "scale-125 opacity-0" : ""
        } ${still ? "landing-still" : ""}`}
      >
        {[...COLUMNS, ...COLUMNS.slice(0, 2)].map((column, c) => (
          <div key={c} className={`flex w-44 shrink-0 flex-col gap-4 sm:w-56 ${c % 2 ? "drift-down" : "drift-up"}`}>
            {[...column, ...column].map((tile, i) => {
              const lit = tile.stage === stage;
              return (
                <div key={i} className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl">
                  <Image
                    src={tile.src}
                    alt=""
                    fill
                    sizes="256px"
                    // Only 11 different small photos, repeated: load them all now so no tile pops in late.
                    loading="eager"
                    className={`object-cover transition duration-700 ${
                      lit ? "scale-105 brightness-110 saturate-110" : "brightness-[0.5] saturate-[0.8]"
                    }`}
                  />
                  <div aria-hidden className={`photo-wash absolute inset-0 ${lit ? "opacity-25" : "opacity-100"}`} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Darken the middle so the text is always readable over the photos. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_55%_50%_at_center,rgba(13,8,32,0.86)_0%,rgba(13,8,32,0.6)_55%,rgba(13,8,32,0)_100%)]"
      />

      <div
        className={`relative z-10 mx-auto max-w-3xl px-4 py-16 text-center transition duration-300 ${leaving ? "opacity-0" : ""}`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">New York City · Tonight</p>
        <h1 id="landing-title" className="mt-4 font-logo text-[2.1rem] uppercase leading-[1.2] tracking-[0.02em] sm:text-6xl sm:leading-[1.12]">
          <span className="block">Plan the</span> <span className="block"><span className="text-glow-gradient">perfect</span></span>{" "}
          <span className="block">night out</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-fg/85 sm:text-lg">
          Drinks, dinner, a show and somewhere to dance, picked for you, a short walk apart and on budget.
        </p>

        {/* The sample night, stepping along with the photos. */}
        <ol aria-label="A sample night" className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-1 gap-y-1.5 text-xs sm:gap-x-2 sm:text-sm">
          {STAGES.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setStage(i);
                  setPaused(true);
                }}
                aria-current={i === stage ? "step" : undefined}
                className={`rounded-full px-2.5 py-1.5 transition sm:px-3 ${
                  i === stage ? "bg-fg text-bg font-semibold" : "text-fg/70 hover:text-fg"
                }`}
              >
                <span className="tabular-nums">{s.time}</span> · {s.label}
              </button>
              {i < STAGES.length - 1 && (
                <span aria-hidden className="text-fg/40">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/plan"
            onClick={open("/plan")}
            className="bg-glow-gradient rounded-full px-7 py-3.5 font-semibold text-accent-ink shadow-[0_6px_28px_rgba(224,60,200,0.35)] transition hover:brightness-110"
          >
            Plan my night →
          </Link>
          <Link
            href="/plan?roll=1"
            onClick={open("/plan?roll=1")}
            className="rounded-full border border-fg/30 bg-bg/40 px-6 py-3.5 font-medium text-fg backdrop-blur transition hover:border-fg/60"
          >
            🎲 Roll the dice
          </Link>
        </div>
      </div>

      {/* Moving content needs a way to stop it. */}
      {!reduceMotion && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="absolute bottom-4 right-4 z-10 rounded-full border border-fg/25 bg-bg/60 px-3 py-1.5 text-xs text-fg/80 backdrop-blur hover:text-fg"
        >
          {paused ? "▶ Play" : "❚❚ Pause"}
        </button>
      )}
    </section>
  );
}
