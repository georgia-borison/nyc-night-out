import { areaContext, locateVenue, onMapNear } from "./geocode";
import { BUDGETS, budgetLevels, priceLevel, type Option, type Trip } from "./schema";
import { checkLinks } from "./verifyUrl";
import { milesBetween } from "./walk";

// On a walking night, keep options within this straight-line distance of the
// area's center (the street grid makes it roughly a 20-minute walk).
export const WALK_RADIUS_MI = 0.75;
// Even when rides are OK, anything further than this is a mistake.
const RIDE_RADIUS_MI = 2.5;

export type Vetted = {
  /** Real, open, close enough and on budget, closest first, with coordinates when known. */
  near: Option[];
  /** Real, open and close enough, but cheaper than the budget. Used before far ones. */
  cheaper: Option[];
  /** Real and open, but the map couldn't place them, so they may not be close. */
  unplaced: Option[];
  /** Real and open but outside the walking radius, closest first. Used only as a last resort. */
  far: Option[];
  /** Names that were ruled out, and why (for logs and to exclude from top-ups). */
  dropped: { name: string; reason: "closed" | "unverified" | "too far" | "over budget" }[];
};

export const SHOW = 3;
export const NOT_MUCH_NEARBY = "Not much nearby matches your filters, so these are the closest.";

export type VetTrip = Pick<Trip, "area" | "rides" | "budget" | "budgetTo">;

// Words that don't tell two kinds of place apart ("Modern Italian" is Italian).
const GENERIC = new Set([
  "restaurant", "bar", "lounge", "modern", "contemporary", "new", "style", "cuisine", "kitchen", "house", "and",
  "spot", "food", "fine", "dining", "casual", "upscale", "classic", "traditional", "regional", "the", "of", "with",
]);

/** The words that say what kind of place it is: "Natural wine bar" -> ["natural", "wine"]. */
export function categoryWords(category: string) {
  return category
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !GENERIC.has(w));
}

/** Two options are the same kind of place when their categories share a word (Italian / Roman Italian). */
function sameKind(a: Option, b: Option) {
  const words = new Set(categoryWords(a.category));
  return categoryWords(b.category).some((w) => words.has(w));
}

/**
 * The options to show for a section. Order of preference: nearby and on
 * budget, then nearby but cheaper, then ones the map couldn't place, then (only if there still aren't enough)
 * the closest far ones. At each step, a kind of place that isn't showing yet
 * (a new cuisine or bar style) wins over another of the same kind.
 */
export function choose(rounds: Vetted[], shownElsewhere: Set<string> = new Set()): { options: Option[]; note?: string } {
  // Names already shown in another section are skipped, so a bar isn't both pre- and post-dinner.
  const seen = new Set(shownElsewhere);
  const unique = (list: Option[]) =>
    list.filter((o) => {
      const key = o.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const near = unique(rounds.flatMap((r) => r.near));
  const cheaper = unique(rounds.flatMap((r) => r.cheaper));
  const unplaced = unique(rounds.flatMap((r) => r.unplaced ?? []));
  const far = unique(rounds.flatMap((r) => r.far));

  const picked: Option[] = [];
  const take = (list: Option[], newKindOnly: boolean) => {
    for (const o of list) {
      if (picked.length >= SHOW) return;
      if (picked.includes(o)) continue;
      if (newKindOnly && picked.some((p) => sameKind(p, o))) continue;
      picked.push(o);
    }
  };
  take(near, true);
  take(cheaper, true);
  take(near, false);
  take(cheaper, false);
  take(unplaced, true);
  take(unplaced, false);
  const closeCount = picked.length;
  take(far, true);
  take(far, false);
  // Keep the closest first.
  const order = [...near, ...cheaper, ...unplaced, ...far];
  picked.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return { options: picked, note: picked.length > closeCount ? NOT_MUCH_NEARBY : undefined };
}

/**
 * Checks Claude's candidates before they're shown: drops closed,
 * unverifiable and over-budget venues, places the rest on the map, and splits
 * them by distance from the night's area.
 */
export async function vetOptions(options: Option[], trip: VetTrip): Promise<Vetted> {
  const { area, rides } = trip;
  const levels = budgetLevels(trip).map((l) => BUDGETS.indexOf(l));
  const [low, high] = [Math.min(...levels), Math.max(...levels)];

  const dropped: Vetted["dropped"] = [];
  // Over budget is decided from the price alone, so skip the slower checks for those.
  const affordable = options.filter((o) => {
    const level = priceLevel(o.price);
    if (level !== null && level > high) {
      dropped.push({ name: o.name, reason: "over budget" });
      return false;
    }
    return true;
  });

  const [{ center }, links, points] = await Promise.all([
    areaContext(area),
    checkLinks(affordable, area),
    Promise.all(affordable.map((o) => locateVenue(o.name, o.address, area))),
  ]);

  const real: { i: number; option: Option; miles: number | null; cheaper: boolean }[] = [];
  await Promise.all(
    affordable.map(async (o, i) => {
      const point = points[i];
      if (links.closed.includes(o.name)) {
        dropped.push({ name: o.name, reason: "closed" });
        return;
      }
      let option: Option = point ? { ...o, lat: point.lat, lng: point.lng } : { ...o };
      if (links.bad.includes(o.name) || !o.url) {
        // No working website: only keep it if the map knows a place by that name nearby.
        const near = point ?? center;
        if (!near || !(await onMapNear(o.name, near))) {
          dropped.push({ name: o.name, reason: "unverified" });
          return;
        }
        option = { ...option, url: "" };
      }
      const level = priceLevel(o.price);
      real.push({
        i,
        option,
        miles: point && center ? milesBetween(center, point) : null,
        cheaper: level !== null && level < low,
      });
    }),
  );
  // The checks finish in any order; restore Claude's order so ties keep it.
  real.sort((a, b) => a.i - b.i);

  const limit = rides ? RIDE_RADIUS_MI : WALK_RADIUS_MI;
  const byDistance = (a: { miles: number | null }, b: { miles: number | null }) =>
    (a.miles ?? Infinity) - (b.miles ?? Infinity);
  const close = real.filter((r) => r.miles !== null && r.miles <= limit).sort(byDistance);
  const far = real.filter((r) => r.miles !== null && r.miles > limit).sort(byDistance);
  for (const r of far) dropped.push({ name: r.option.name, reason: "too far" });
  return {
    near: close.filter((r) => !r.cheaper).map((r) => r.option),
    cheaper: close.filter((r) => r.cheaper).map((r) => r.option),
    unplaced: real.filter((r) => r.miles === null).map((r) => r.option),
    // Walking-night fallbacks stay within ride distance; with rides on, "far" is never shown.
    far: rides ? [] : far.filter((r) => r.miles! <= RIDE_RADIUS_MI).map((r) => r.option),
    dropped,
  };
}
