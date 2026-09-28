import { locateVenue } from "@/lib/geocode";
import { LocateRequestSchema } from "@/lib/schema";

// Looks up one venue's coordinates in the background as soon as it's picked,
// so building the itinerary doesn't wait on map lookups.
export async function POST(request: Request) {
  const parsed = LocateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { name, address, area } = parsed.data;
  const point = await locateVenue(name, address, area);
  return Response.json(point ?? { lat: null, lng: null });
}
