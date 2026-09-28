import type { ItineraryStop } from "./schema";

// Free OpenStreetMap geocoder. Its usage policy asks for at most one request
// per second and an identifying User-Agent.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "NightOutNYC/1.0 (https://nyc-night-out.vercel.app)";
// Rough box around the five boroughs, so "Anton's" doesn't land in Ohio.
const NYC_VIEWBOX = "-74.26,40.92,-73.68,40.49";

async function lookup(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL(NOMINATIM);
  url.search = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    countrycodes: "us",
    viewbox: NYC_VIEWBOX,
    bounded: "1",
  }).toString();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Add map coordinates to each stop. Tries the street address first, then the
 * venue name. A stop that can't be found simply gets no pin.
 */
export async function geocodeStops(stops: ItineraryStop[]): Promise<ItineraryStop[]> {
  const out: ItineraryStop[] = [];
  let first = true;
  for (const stop of stops) {
    const queries = [stop.address && `${stop.address}, New York`, `${stop.name}, New York`].filter(Boolean) as string[];
    let hit = null;
    for (const q of queries) {
      if (!first) await pause(1100);
      first = false;
      hit = await lookup(q);
      if (hit) break;
    }
    out.push(hit ? { ...stop, ...hit } : stop);
  }
  return out;
}
