import { areaContext, locateVenue, onMapNear } from "./geocode";
import type { Option } from "./schema";
import { checkLinks } from "./verifyUrl";
import { milesBetween } from "./walk";

// On a walking night, keep options within this straight-line distance of the
// area's center (the street grid makes it roughly a 20-minute walk).
export const WALK_RADIUS_MI = 0.75;
// Even when rides are OK, anything further than this is a mistake.
const RIDE_RADIUS_MI = 2.5;

export type Vetted = {
  /** Real, open and close enough, closest first, with coordinates when known. */
  near: Option[];
  /** Real and open but outside the walking radius, closest first. Used only as a last resort. */
  far: Option[];
  /** Names that were ruled out, and why (for logs and to exclude from top-ups). */
  dropped: { name: string; reason: "closed" | "unverified" | "too far" }[];
};

export const SHOW = 3;
export const NOT_MUCH_NEARBY = "Not much nearby matches your filters, so these are the closest.";

/**
 * The options to show for a section: nearby ones first (from every vetting
 * round, in order), then, only if there aren't enough, the closest far ones.
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
  const near = unique(rounds.flatMap((r) => r.near)).slice(0, SHOW);
  if (near.length >= SHOW) return { options: near };
  const fill = unique(rounds.flatMap((r) => r.far)).slice(0, SHOW - near.length);
  return { options: [...near, ...fill], note: fill.length ? NOT_MUCH_NEARBY : undefined };
}

/**
 * Checks Claude's candidates before they're shown: drops closed and
 * unverifiable venues, places the rest on the map, and splits them by
 * distance from the night's area.
 */
export async function vetOptions(options: Option[], area: string, rides: boolean): Promise<Vetted> {
  const [{ center }, links, points] = await Promise.all([
    areaContext(area),
    checkLinks(options, area),
    Promise.all(options.map((o) => locateVenue(o.name, o.address, area))),
  ]);

  const dropped: Vetted["dropped"] = [];
  const real: { option: Option; miles: number | null }[] = [];
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const point = points[i];
    if (links.closed.includes(o.name)) {
      dropped.push({ name: o.name, reason: "closed" });
      continue;
    }
    let option: Option = point ? { ...o, lat: point.lat, lng: point.lng } : { ...o };
    if (links.bad.includes(o.name) || !o.url) {
      // No working website: only keep it if the map knows a place by that name nearby.
      const near = point ?? center;
      if (!near || !(await onMapNear(o.name, near))) {
        dropped.push({ name: o.name, reason: "unverified" });
        continue;
      }
      option = { ...option, url: "" };
    }
    real.push({ option, miles: point && center ? milesBetween(center, point) : null });
  }

  const limit = rides ? RIDE_RADIUS_MI : WALK_RADIUS_MI;
  const byDistance = (a: { miles: number | null }, b: { miles: number | null }) =>
    (a.miles ?? Infinity) - (b.miles ?? Infinity);
  const near = real.filter((r) => r.miles === null || r.miles <= limit).sort(byDistance);
  const far = real.filter((r) => r.miles !== null && r.miles > limit).sort(byDistance);
  for (const r of far) dropped.push({ name: r.option.name, reason: "too far" });
  return {
    near: near.map((r) => r.option),
    // Walking-night fallbacks stay within ride distance; with rides on, "far" is never shown.
    far: rides ? [] : far.filter((r) => r.miles! <= RIDE_RADIUS_MI).map((r) => r.option),
    dropped,
  };
}
