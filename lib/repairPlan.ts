import { GEO_VERSION, geocodeStops } from "./geocode";
import { templateTitle } from "./planTitle";
import type { SavedPlan } from "./schema";
import { updatePlan } from "./store";

/**
 * Plans saved before the current map lookup (or with a blank title) get fixed
 * the first time they're opened, then saved back so it only happens once.
 */
export async function repairPlan(plan: SavedPlan): Promise<SavedPlan> {
  const { itinerary, trip } = plan;
  const needsGeo = (itinerary.geoVersion ?? 0) < GEO_VERSION;
  const needsTitle = !itinerary.title.trim();
  if (!needsGeo && !needsTitle) return plan;

  const fixed: SavedPlan = {
    ...plan,
    itinerary: {
      ...itinerary,
      title: needsTitle ? templateTitle(trip.area) : itinerary.title,
      stops: needsGeo ? await geocodeStops(itinerary.stops, trip.area) : itinerary.stops,
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
