import { askClaude, errorResponse, quickTitle } from "@/lib/claude";
import { GEO_VERSION, geocodeStops } from "@/lib/geocode";
import { templateTitle } from "@/lib/planTitle";
import { itineraryPrompt } from "@/lib/prompt";
import { ITINERARY_JSON_SCHEMA, ItineraryRequestSchema, ItinerarySchema } from "@/lib/schema";

export const maxDuration = 300;

export async function POST(request: Request) {
  const parsed = ItineraryRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { picks, ...trip } = parsed.data;
  try {
    const result = await askClaude({
      prompt: itineraryPrompt(trip, picks),
      schema: ItinerarySchema,
      jsonSchema: ITINERARY_JSON_SCHEMA,
      submitDescription: "Submit the final itinerary for the night.",
      webSearch: false,
    });
    const itinerary = result.data;
    let costUsd = result.costUsd;

    // Every plan gets a name: ask once more, then fall back to a template.
    if (!itinerary.title.trim()) {
      const names = itinerary.stops.map((s) => s.name).join(", ");
      const fallback = await quickTitle(`Area: ${trip.area}. Vibe: ${trip.vibe || "none given"}. Stops: ${names}.`);
      itinerary.title = fallback?.title ?? templateTitle(trip.area);
      costUsd += fallback?.costUsd ?? 0;
    }

    // Coordinates for the map. Saved with the plan, so shared links never redo this.
    const stops = await geocodeStops(itinerary.stops, trip.area);
    return Response.json({ itinerary: { ...itinerary, stops, geoVersion: GEO_VERSION }, costUsd });
  } catch (err) {
    return errorResponse(err);
  }
}
