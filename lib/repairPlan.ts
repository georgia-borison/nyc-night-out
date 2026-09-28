import { GEO_VERSION, geocodeStops } from "./geocode";
import { templateTitle } from "./planTitle";
import type { SavedPlan } from "./schema";
import { updatePlan } from "./store";
import { checkLinks } from "./verifyUrl";
import { attachWalks } from "./walk";

/**
 * Plans saved before the current map logic (or with a blank title) get fixed
 * the first time they're opened, then saved back so it only happens once.
 *   v2: borough-aware pins. v3: real walking times and checked website links.
 */
export async function repairPlan(plan: SavedPlan): Promise<SavedPlan> {
  const { itinerary, trip } = plan;
  const version = itinerary.geoVersion ?? 0;
  const needsGeo = version < GEO_VERSION;
  const needsTitle = !itinerary.title.trim();
  if (!needsGeo && !needsTitle) return plan;

  let stops = itinerary.stops;
  if (needsGeo) {
    if (version < 2) stops = await geocodeStops(stops, trip.area);
    const [walked, links] = await Promise.all([attachWalks(stops), checkLinks(stops, trip.area)]);
    // A plan already made keeps its stops; a dead or closed site just becomes a search link.
    const drop = [...links.bad, ...links.closed];
    stops = walked.map((s) => (drop.includes(s.name) ? { ...s, url: "" } : s));
  }

  const fixed: SavedPlan = {
    ...plan,
    itinerary: {
      ...itinerary,
      title: needsTitle ? templateTitle(trip.area) : itinerary.title,
      stops,
      geoVersion: GEO_VERSION,
    },
  };
  try {
    await updatePlan(fixed);
  } catch (err) {
    // Still show the fixed version; it'll try again next time.
    console.error("[plans] repair save failed", err);
  }
  return fixed;
}
