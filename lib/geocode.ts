import type { ItineraryStop } from "./schema";
import { censusLocate } from "./censusGeocode";
import { areaInfo, type Borough } from "./neighborhoods";
import { nameWords } from "./verifyUrl";

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

type Hit = { lat: number; lng: number; addresstype?: string; type?: string; name?: string };
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
// Requests waiting their turn; each one ahead adds about a second.
let waiting = 0;
function nominatim(params: Record<string, string>): Promise<Hit[]> {
  waiting++;
  const run = queue.then(async () => {
    const wait = lastRequest + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    waiting--;
    return request(params);
  });
  queue = run.catch(() => {});
  return run;
}

// A second free OpenStreetMap search with no one-per-second rule. It's slower
// per request (about 4-6 s), so it's only used when Nominatim's queue is long.
const PHOTON = "https://photon.komoot.io/api/";
const BUSY_QUEUE = 4;
const PHOTON_LIMIT = 6;
let photonActive = 0;
const photonWaiters: (() => void)[] = [];

// Photon's "type" for results that cover an area or a street, not a single place.
const PHOTON_AREA: Record<string, string> = {
  street: "road", locality: "suburb", district: "suburb", city: "city", county: "county", state: "state", country: "country",
};

async function photon(q: string, near: { lat: number; lng: number } | null, box: string): Promise<Hit[] | null> {
  if (photonActive >= PHOTON_LIMIT) await new Promise<void>((r) => photonWaiters.push(r));
  photonActive++;
  try {
    const url = new URL(PHOTON);
    url.search = new URLSearchParams({
      q,
      limit: "5",
      lang: "en",
      bbox: box,
      ...(near ? { lat: String(near.lat), lon: String(near.lng) } : {}),
    }).toString();
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features: { geometry: { coordinates: [number, number] }; properties: { name?: string; type?: string } }[];
    };
    return data.features.map((f) => ({
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      name: f.properties.name,
      addresstype: PHOTON_AREA[f.properties.type ?? ""],
    }));
  } catch {
    return null;
  } finally {
    photonActive--;
    photonWaiters.shift()?.();
  }
}

/**
 * Search for a place by name inside a box ("minLng,maxLat,maxLng,minLat",
 * Nominatim's order), from whichever geocoder will answer sooner.
 */
async function searchByName(
  q: string,
  box: string,
  near: { lat: number; lng: number } | null,
  /** Photon matches loosely, so its results must pass this name check. */
  named: (h: Hit) => boolean,
  photonQuery = q,
): Promise<Hit[]> {
  if (waiting >= BUSY_QUEUE) {
    const [w, n, e, s] = box.split(",");
    const hits = await photon(photonQuery, near, [w, s, e, n].join(","));
    if (hits) return hits.filter(named);
  }
  return nominatim({ q, viewbox: box, bounded: "1" });
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
    const rows = (await res.json()) as { lat: string; lon: string; addresstype?: string; type?: string; name?: string }[];
    return rows.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      addresstype: r.addresstype,
      type: r.type,
      name: r.name,
    }));
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
    // The Census geocoder is fast and has no rate limit; try it first.
    const census = await censusLocate(stop.address);
    if (census && (!center || where.explicit || km(census, center) <= MAX_KM_FROM_AREA)) return census;
    const structured = { street, city, state: "New York", ...(zip ? { postalcode: zip } : {}) };
    const hit = pick(await nominatim(structured), center, where) ?? pick(await nominatim({ q: `${street}, ${city}, New York` }), center, where);
    if (hit) return hit;
  }
  const named = namedFor(stop.name) ?? (() => false);
  return pick(await searchByName(`${stop.name}, ${city}, New York`, NYC_VIEWBOX, center, named, stop.name), center, where);
}

/** Coordinates for one venue near the night's area, or null if it can't be placed precisely. */
export async function locateVenue(name: string, address: string, area: string): Promise<{ lat: number; lng: number } | null> {
  const { center, borough } = await areaContext(area);
  const hit = await locate({ name, address }, center, borough);
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

const PLACE_WORDS = new Set([
  "manhattan", "brooklyn", "queens", "bronx", "harlem", "village", "uptown", "downtown", "midtown",
  "west", "east", "north", "south", "upper", "lower", "side", "broadway", "hudson", "river", "park",
  "square", "street", "avenue", "city", "empire", "gotham", "astoria", "williamsburg", "chelsea", "soho",
]);

/**
 * Whether OpenStreetMap has a place with this name within ~400 m of a point.
 * The map is incomplete, so "no" is only meaningful alongside other signals.
 */
/** Words that identify the venue itself, not a place ("Manhattan" Cricket Club). */
function distinctiveWords(name: string) {
  return nameWords(name.replace(/[’‘]/g, "'")).filter((w) => w.length >= 3 && !PLACE_WORDS.has(w));
}

/** Whether a result is named for the venue, not just on a street or in a building that is. Null if the name is too generic to tell. */
function namedFor(name: string): ((h: Hit) => boolean) | null {
  const distinctive = distinctiveWords(name);
  if (!distinctive.length) return null;
  return (h: Hit) => distinctive.some((w) => h.name?.toLowerCase().includes(w));
}

export async function onMapNear(name: string, point: { lat: number; lng: number }): Promise<boolean> {
  const d = 0.004; // ~400 m
  const viewbox = [point.lng - d, point.lat + d, point.lng + d, point.lat - d].join(",");
  const full = name.replace(/[’‘]/g, "'");
  const named = namedFor(full);
  if (!named) return false;

  if ((await searchByName(full, viewbox, point, named)).some(named)) return true;
  // The map often has a shorter name ("Awash" for "Awash Ethiopian Restaurant"),
  // so try the first distinctive word on its own.
  const core = distinctiveWords(full).find((w) => w.length >= 4);
  if (!core || core === full.toLowerCase()) return false;
  const hasCore = (h: Hit) => !!h.name?.toLowerCase().includes(core);
  return (await searchByName(core, viewbox, point, hasCore)).some(hasCore);
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
