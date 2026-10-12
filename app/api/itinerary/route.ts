import { askClaude, errorResponse, quickTitle } from "@/lib/claude";
import { GEO_VERSION, geocodeStops, locateVenue } from "@/lib/geocode";
import { templateTitle } from "@/lib/planTitle";
import { itineraryPrompt } from "@/lib/prompt";
import { ITINERARY_JSON_SCHEMA, ItineraryRequestSchema, ItinerarySchema, pieceLabel, type Pick } from "@/lib/schema";
import { attachWalks, bestOrder } from "@/lib/walk";

export const maxDuration = 300;

// Rough box around the five boroughs; coordinates from the browser must be inside it.
const inNYC = (lat?: number, lng?: number) =>
  lat !== undefined && lng !== undefined && lat > 40.49 && lat < 40.92 && lng > -74.26 && lng < -73.68;

export async function POST(request: Request) {
  const parsed = ItineraryRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const started = Date.now();
  const secs = () => ((Date.now() - started) / 1000).toFixed(1);
  const { picks: rawPicks, ...trip } = parsed.data;

  // Picks normally arrive with coordinates (looked up in the background while
  // choosing). Only look up the rare one that doesn't have them yet.
  const picks: Pick[] = [];
  for (const p of rawPicks) {
    if (inNYC(p.lat, p.lng)) picks.push(p);
    else {
      const point = await locateVenue(p.name, p.address, trip.area);
      picks.push(point ? { ...p, ...point } : { ...p, lat: undefined, lng: undefined });
    }
  }
  if (picks.some((p, i) => p !== rawPicks[i])) console.log(`[itinerary] late lookups done at ${secs()}s`);
  // The sensible order with the least walking (a show next to dinner goes right before or after it).
  const { order: ordered, miles } = bestOrder(picks);
  console.log(`[itinerary] order: ${ordered.map((p) => p.piece).join(" → ")} (~${miles.toFixed(2)} mi)`);

  try {
    const isFiller = (s = "") => !s.trim() || /^(placeholder|tbd|todo|\.\.\.)$/i.test(s.trim());
    const result = await askClaude({
      prompt: itineraryPrompt(trip, ordered),
      schema: ItinerarySchema,
      jsonSchema: ITINERARY_JSON_SCHEMA,
      submitDescription: "Submit the final itinerary for the night.",
      webSearch: false,
      // Claude sometimes submits filler first ({"title":"placeholder","stops":[]}),
      // which passes the shape check. Send it back to finish the real thing.
      check: (it) =>
        it.stops.length !== picks.length || it.stops.some((s) => isFiller(s.name)) || isFiller(it.title)
          ? `That was a placeholder, not the itinerary. Submit the real itinerary: a title, a tagline, and exactly ${picks.length} stops (one per pick) with real times, notes and getting_there advice.`
          : null,
    });
    let costUsd = result.costUsd;
    console.log(`[itinerary] Claude done at ${secs()}s`);
    const itinerary = result.data;
    if (isFiller(itinerary.tagline)) itinerary.tagline = "";

    // Every plan gets a name: ask once more, then fall back to a template.
    if (!itinerary.title.trim()) {
      const names = itinerary.stops.map((s) => s.name).join(", ");
      const fallback = await quickTitle(`Area: ${trip.area}. Vibe: ${trip.vibe || "none given"}. Stops: ${names}.`);
      itinerary.title = fallback?.title ?? templateTitle(trip.area);
      costUsd += fallback?.costUsd ?? 0;
    }

    // Each stop is one of the picks. Match by name, allowing for Claude shortening
    // it ("Loulou" for "Live at Loulou"), then by position as a last resort.
    const norm = (n: string) => n.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim();
    const pickFor = (s: { name: string }, i: number) =>
      picks.find((p) => norm(p.name) === norm(s.name)) ??
      picks.find((p) => norm(p.name).includes(norm(s.name)) || norm(s.name).includes(norm(p.name))) ??
      (itinerary.stops.length === ordered.length ? ordered[i] : undefined);
    const stopPicks = itinerary.stops.map((s, i) => pickFor(s, i));

    // Reuse the picks' coordinates; only unmatched stops get looked up.
    const matched = itinerary.stops.map((s, i) => {
      const pick = stopPicks[i];
      return pick && pick.lat !== undefined && pick.lng !== undefined ? { ...s, lat: pick.lat, lng: pick.lng } : null;
    });
    const unmatched = itinerary.stops.filter((_, i) => !matched[i]);
    const located = unmatched.length ? await geocodeStops(unmatched, trip.area) : [];
    const pinned = itinerary.stops.map((s, i) => matched[i] ?? located.shift() ?? s);
    // Claude re-types each stop's label, link and address; use the picks' instead.
    // The label must be the part of the night they chose: an activity placed after
    // dinner is still "Activity or show", even when the venue is bar-like.
    const linked = pinned.map((s, i) => {
      const pick = stopPicks[i];
      if (!pick) return s;
      return {
        ...s,
        piece: pieceLabel(pick.piece),
        url: pick.url,
        linkKind: pick.linkKind,
        address: pick.address || s.address,
        booked: pick.booked,
        reservations: pick.reservations,
      };
    });

    const stops = await attachWalks(linked);
    console.log(`[itinerary] walks done at ${secs()}s (${unmatched.length} stops needed a lookup)`);
    return Response.json({ itinerary: { ...itinerary, stops, geoVersion: GEO_VERSION }, costUsd });
  } catch (err) {
    return errorResponse(err);
  }
}
