// US Census Bureau geocoder: free, no key, and no one-per-second limit, so
// every candidate in a section can be looked up at once. Street addresses only.
const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

type Match = { coordinates: { x: number; y: number } };

const cache = new Map<string, Promise<{ lat: number; lng: number } | null>>();

/** Coordinates for a full street address, or null if the Census has no match. */
export function censusLocate(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = address.trim().toLowerCase();
  if (!/^\d/.test(key)) return Promise.resolve(null); // needs a house number
  let hit = cache.get(key);
  if (!hit) {
    hit = lookup(address).catch(() => null);
    cache.set(key, hit);
  }
  return hit;
}

async function lookup(address: string) {
  const url = new URL(CENSUS);
  url.search = new URLSearchParams({ address, benchmark: "Public_AR_Current", format: "json" }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const body = (await res.json()) as { result?: { addressMatches?: Match[] } };
  const m = body.result?.addressMatches?.[0];
  if (!m) return null;
  const point = { lat: m.coordinates.y, lng: m.coordinates.x };
  // Only accept points inside NYC.
  const inNYC = point.lat > 40.49 && point.lat < 40.92 && point.lng > -74.26 && point.lng < -73.68;
  return inNYC ? point : null;
}
