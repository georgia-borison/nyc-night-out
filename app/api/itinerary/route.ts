import { askClaude, errorResponse } from "@/lib/claude";
import { geocodeStops } from "@/lib/geocode";
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
    const { data: itinerary, costUsd } = await askClaude({
      prompt: itineraryPrompt(trip, picks),
      schema: ItinerarySchema,
      jsonSchema: ITINERARY_JSON_SCHEMA,
      submitDescription: "Submit the final itinerary for the night.",
      webSearch: false,
    });
    // Coordinates for the map. Saved with the plan, so shared links never redo this.
    const stops = await geocodeStops(itinerary.stops);
    return Response.json({ itinerary: { ...itinerary, stops }, costUsd });
  } catch (err) {
    return errorResponse(err);
  }
}
