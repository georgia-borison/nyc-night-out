import { visibleAreas } from "./neighborhoods";
import type { PieceId } from "./schema";

// "Roll the dice": a whole night chosen at random. Pure (pass in your own
// random function to test it); remembering recent rolls is up to the caller.

const VIBES = [
  "A little fancy, a little loud",
  "Hidden-gem crawl: places locals love that tourists miss",
  "Date night that feels like a trip abroad",
  "Big catch-up with friends, lively and fun",
  "Low-key and cozy, somewhere we can actually talk",
  "Something we've never tried before",
  "Old-school New York classics",
  "Buzzy new spots everyone's talking about",
  "Bold flavors and a little bit of spice",
  "Candlelit, romantic, unhurried",
  "Playful and a little weird, in the best way",
  "Great music and a good crowd",
  "Neighborhood favorites with real character",
  "Celebrating something: festive but not stuffy",
  "Artsy, creative crowd",
];

export type Roll = {
  area: string;
  pieces: PieceId[];
  vibe: string;
  /** "HH:MM" */
  time: string;
};

/** Weighted pick: [value, weight][] */
function weighted<T>(choices: [T, number][], random: () => number): T {
  const total = choices.reduce((sum, [, w]) => sum + w, 0);
  let r = random() * total;
  for (const [value, w] of choices) {
    r -= w;
    if (r < 0) return value;
  }
  return choices[choices.length - 1][0];
}

/** Every walkable neighborhood in the list (rolls are walking nights). */
export function rollableAreas() {
  return visibleAreas(false).flatMap((b) => b.areas.map((a) => a.name));
}

/**
 * A random night: any neighborhood (avoiding recent ones), always dinner,
 * never both pre- and post-dinner drinks, and usually one extra.
 */
export function rollNight(opts: { noDrinks: boolean; recent?: string[]; random?: () => number }): Roll {
  const random = opts.random ?? Math.random;
  const areas = rollableAreas();
  const fresh = areas.filter((a) => !(opts.recent ?? []).includes(a));
  const pool = fresh.length ? fresh : areas;
  const area = pool[Math.floor(random() * pool.length)];

  const pieces: PieceId[] = ["dinner"];
  let extra: PieceId | null;
  if (opts.noDrinks) {
    // No bars at all, so no dancing either (clubs and DJ bars).
    extra = weighted<PieceId>([["activity", 70], ["events", 30]], random);
  } else {
    pieces.push(random() < 0.5 ? "pre_drinks" : "post_drinks");
    const late = pieces.includes("post_drinks");
    extra = weighted<PieceId | null>(
      [["activity", 45], ["events", 15], ...(late ? ([["dancing", 15]] as [PieceId, number][]) : []), [null, 25]],
      random,
    );
  }
  if (extra) pieces.push(extra);

  const base = VIBES[Math.floor(random() * VIBES.length)];
  const vibe = opts.noDrinks ? `${base}. No drinks tonight: no bars or alcohol-focused spots.` : base;
  return { area, pieces, vibe, time: pieces.includes("pre_drinks") ? "18:30" : "19:00" };
}

// Recent rolls, so the same neighborhood doesn't keep coming up.
const RECENT_KEY = "nightout.recentRolls";
const KEEP = 5;

export function recentRolls(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function rememberRoll(area: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([area, ...recentRolls().filter((a) => a !== area)].slice(0, KEEP)));
  } catch {
    // Private mode or storage off: rolls just won't avoid repeats.
  }
}
