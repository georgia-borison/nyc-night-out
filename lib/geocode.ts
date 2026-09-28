import type { ItineraryStop } from "./schema";
import { areaInfo, type Borough } from "./neighborhoods";

// Free OpenStreetMap geocoder. Its usage policy asks for at most one request
// per second and an identifying User-Agent.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "NightOutNYC/1.0 (https://nyc-night-out.vercel.app)";
// Rough box around the five boroughs.
const NYC_VIEWBOX = "-74.26,40.92,-73.68,40.49";
// Pins further than this from the night's neighborhood are treated as wrong,
// unless the address itself names another borough.
const MAX_KM_FROM_AREA = 6;
// Bump when the lookup logic changes, so saved plans get re-geocoded once.
// v3 added real walking times between stops.
export const GEO_VERSION = 3;

type Hit = { lat: number; lng: number; addresstype?: string; type?: string };
type Where = { borough: Borough | null; explicit: boolean };
type Center = { lat: number; lng: number } | null;

// Results for a whole area or street, not a specific place. A pin in the
// middle of a neighborhood looks precise but isn't.
const IMPRECISE = new Set([
  "road", "neighbourhood", "suburb", "quarter", "city_district", "city", "borough",
  "county", "state", "postcode", "town", "village", "hamlet", "country",
]);

const QUEENS_TOWNS = /\b(astoria|long island city|flushing|jackson heights|ridgewood|sunnyside|woodside|elmhurst|forest hills|corona|maspeth|jamaica)\b/i;

/** Which borough an address is in, and whether the address says so itself. */
export function boroughOf(address: string, fallback: Borough | null): Where {
  const named = address.match(/\b(manhattan|brooklyn|queens|bronx|staten island)\b/i)?.[1];
  if (named) {
    const b = named.toLowerCase();
    const map: Record<string, Borough> = {
      manhattan: "Manhattan", brooklyn: "Brooklyn", queens: "Queens", bronx: "Bronx", "staten island": "Staten Island",
    };
    return { borough: map[b], explicit: true };
  }
  if (QUEENS_TOWNS.test(address)) return { borough: "Queens", explicit: true };
  const zip = address.match(/\b(1[01]\d{3})\b/)?.[1];
  if (zip) {
    const p = zip.slice(0, 3);
    if (["100", "101", "102"].includes(p)) return { borough: "Manhattan", explicit: true };
    if (p === "103") return { borough: "Staten Island", explicit: true };
    if (p === "104") return { borough: "Bronx", explicit: true };
    if (p === "112") return { borough: "Brooklyn", explicit: true };
    if (["110", "111", "113", "114", "116"].includes(p)) return { borough: "Queens", explicit: true };
  }
  // Postal convention: "New York, NY" means Manhattan.
  if (/new york,?\s*ny/i.test(address)) return { borough: "Manhattan", explicit: false };
  return { borough: fallback, explicit: false };
}

/** The "123 Street Name" part of an address, or null if there's no house number. */
export function streetPart(address: string): string | null {
  return address.split(",").map((s) => s.trim()).find((s) => /^\d+(?:-\d+)?[a-z]?\s+\S/i.test(s)) ?? null;
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// Requests go out one at a time, at most one per second, even when several
// lookups run at once (e.g. background checks while Claude is still writing).
let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;
function nominatim(params: Record<string, string>): Promise<Hit[]> {
  const run = queue.then(async () => {
    const wait = lastRequest + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    return request(params);
  });
  queue = run.catch(() => {});
  return run;
}

async function request(params: Record<string, string>): Promise<Hit[]> {
  const url = new URL(NOMINATIM);
  url.search = new URLSearchParams({
    format: "jsonv2",
    limit: "3",
    countrycodes: "us",
    viewbox: NYC_VIEWBOX,
    bounded: "1",
    ...params,
  }).toString();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as { lat: string; lon: string; addresstype?: string; type?: string }[];
    return rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), addresstype: r.addresstype, type: r.type }));
  } catch {
    return [];
  }
}

function pick(hits: Hit[], center: Center, where: Where): Hit | null {
  return (
    hits.find((h) => {
      if (IMPRECISE.has(h.addresstype ?? "")) return false;
      if (center && !where.explicit && km(h, center) > MAX_KM_FROM_AREA) return false;
      return true;
    }) ?? null
  );
}

type AreaContext = { center: Center; borough: Borough | null };
const areaCache = new Map<string, Promise<AreaContext>>();

/** Center and borough of the night's area, from the list or looked up once. */
export function areaContext(area: string): Promise<AreaContext> {
  const known = areaInfo(area);
  if (known) return Promise.resolve({ center: { lat: known.lat, lng: known.lng }, borough: known.borough });
  let ctx = areaCache.get(area);
  if (!ctx) {
    ctx = nominatim({ q: `${area}, New York City` }).then(([hit]) => ({
      center: hit ? { lat: hit.lat, lng: hit.lng } : null,
      borough: boroughOf(area, null).borough,
    }));
    areaCache.set(area, ctx);
  }
  return ctx;
}

async function locate(stop: { name: string; address: string }, center: Center, areaBorough: Borough | null): Promise<Hit | null> {
  const where = boroughOf(stop.address, areaBorough);
  const city = where.borough ?? "New York";
  const street = streetPart(stop.address);
  const zip = stop.address.match(/\b(1[01]\d{3})\b/)?.[1];

  if (street) {
    const structured = { street, city, state: "New York", ...(zip ? { postalcode: zip } : {}) };
    const hit = pick(await nominatim(structured), center, where) ?? pick(await nominatim({ q: `${street}, ${city}, New York` }), center, where);
    if (hit) return hit;
  }
  return pick(await nominatim({ q: `${stop.name}, ${city}, New York` }), center, where);
}

/** Coordinates for one venue near the night's area, or null if it can't be placed precisely. */
export async function locateVenue(name: string, address: string, area: string): Promise<{ lat: number; lng: number } | null> {
  const { center, borough } = await areaContext(area);
  const hit = await locate({ name, address }, center, borough);
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

/** Coordinates for each venue that can be placed (skips the rest). */
export async function locateAll(
  venues: { name: string; address: string }[],
  area: string,
): Promise<{ name: string; address: string; lat: number; lng: number }[]> {
  const found = await Promise.all(venues.map(async (v) => ({ ...v, point: await locateVenue(v.name, v.address, area) })));
  return found.flatMap((f) => (f.point ? [{ name: f.name, address: f.address, ...f.point }] : []));
}

/**
 * Add map coordinates to each stop. A stop that can't be placed precisely
 * near the night's area gets no pin rather than a wrong one.
 */
export async function geocodeStops(stops: ItineraryStop[], area: string): Promise<ItineraryStop[]> {
  const { center, borough } = await areaContext(area);
  const out: ItineraryStop[] = [];
  for (const stop of stops) {
    // Drop any old coordinates so a stop that can't be placed now loses its pin.
    const rest: ItineraryStop = { ...stop };
    delete rest.lat;
    delete rest.lng;
    const hit = await locate(rest, center, borough);
    out.push(hit ? { ...rest, lat: hit.lat, lng: hit.lng } : rest);
  }
  return out;
}
