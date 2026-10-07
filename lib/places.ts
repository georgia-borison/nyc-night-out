// Real places from Google Places (Text Search, New API): currently operating,
// with real addresses, locations, prices, ratings, hours and websites. Claude
// then chooses among these instead of recalling places from memory, which
// too often gave closed places, made-up ones or wrong addresses.

import { areaShape } from "./areaShape";
import { areaContext } from "./geocode";
import { BUDGETS, budgetLevels, type PieceId, type Trip } from "./schema";
import { nameWords } from "./verifyUrl";
import { targetMinutes } from "./timing";
import { milesBetween } from "./walk";
import { WALK_RADIUS_MI } from "./vetOptions";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
  "places.priceLevel",
  "places.priceRange",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.googleMapsUri",
  // Whether it takes reservations (Google's "Enterprise + Atmosphere" tier).
  "places.reservable",
  "places.primaryType",
  "places.regularOpeningHours",
].join(",");

// Skip places too few people have rated, or that people don't like.
const MIN_RATING = 4.1;
const MIN_RATINGS = 40;
// Areas without an outline: search this far around the center.
const RIDE_RADIUS_MI = 1.5;
// Around a booking on a walking night: about a 10-minute walk.
const BOOKING_WALK_MI = 0.5;

export function placesEnabled() {
  return !!process.env.GOOGLE_PLACES_API_KEY?.trim();
}

export type Candidate = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  /** Budget level index 0-3, or null if Google doesn't know. */
  level: number | null;
  /** e.g. "$30–50 per person" when Google has a range. */
  priceText: string;
  rating: number;
  ratings: number;
  url: string;
  /** Google says it takes reservations (null if Google doesn't know). */
  reservable: boolean | null;
  /** Google Maps page for this exact place: the fallback when the website doesn't check out. */
  mapsUrl: string;
  /** Opening hours on the night's weekday, e.g. "5:00 PM – 2:00 AM". */
  hours: string;
  /** Outside the walkable area: only a fallback. */
  far: boolean;
};

type GooglePlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  businessStatus?: string;
  primaryTypeDisplayName?: { text: string };
  priceLevel?: string;
  priceRange?: { startPrice?: { units?: string }; endPrice?: { units?: string } };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  googleMapsUri?: string;
  primaryType?: string;
  reservable?: boolean;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    periods?: { open: Time; close?: Time }[];
  };
};
type Time = { day: number; hour: number; minute: number };
type Box = { south: number; west: number; north: number; east: number };

// ---- Searching ----

// Results are reused for a few minutes, so pre- and post-dinner drinks (and
// refreshes) share one search instead of paying twice.
const cache = new Map<string, { at: number; places: Promise<GooglePlace[]> }>();
const CACHE_MS = 10 * 60 * 1000;

function search(textQuery: string, box: Box, includedType?: string, pageSize = 20): Promise<GooglePlace[]> {
  const key = JSON.stringify([textQuery, box, includedType, pageSize]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.places;
  const places = (async () => {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!.trim(),
        "X-Goog-FieldMask": FIELDS,
      },
      body: JSON.stringify({
        textQuery,
        ...(includedType ? { includedType } : {}),
        pageSize,
        locationRestriction: {
          rectangle: {
            low: { latitude: box.south, longitude: box.west },
            high: { latitude: box.north, longitude: box.east },
          },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[places] ${res.status} for "${textQuery}": ${(await res.text()).slice(0, 300)}`);
      return [];
    }
    return ((await res.json()) as { places?: GooglePlace[] }).places ?? [];
  })().catch((err) => {
    console.error(`[places] "${textQuery}" failed`, err);
    return [] as GooglePlace[];
  });
  cache.set(key, { at: Date.now(), places });
  return places;
}

/** What to search Google for, per part of the night, shaped by the person's filters. */
function queriesFor(piece: PieceId, trip: Trip): { q: string; type?: string }[] {
  switch (piece) {
    case "dinner":
      return trip.cuisines.length
        ? trip.cuisines.slice(0, 4).map((c) => ({ q: `${c} restaurant`, type: "restaurant" }))
        : [
            { q: "restaurant for dinner", type: "restaurant" },
            { q: "popular local restaurant", type: "restaurant" },
          ];
    case "pre_drinks":
      return trip.barTypes.length
        ? trip.barTypes.slice(0, 3).map((b) => ({ q: b, type: "bar" }))
        : [{ q: "cocktail bar", type: "bar" }, { q: "wine bar" }];
    case "post_drinks":
      return trip.barTypes.length
        ? trip.barTypes.slice(0, 3).map((b) => ({ q: b, type: "bar" }))
        : [{ q: "cocktail bar", type: "bar" }, { q: "late night bar", type: "bar" }];
    case "dancing":
      return [{ q: "dance club", type: "night_club" }, { q: "bar with DJ and dancing" }];
    case "activity":
      return trip.activityTypes.length
        ? trip.activityTypes.slice(0, 3).map((a) => ({ q: a }))
        : [{ q: "comedy club" }, { q: "live music venue or jazz club" }, { q: "museum, gallery or theater" }];
    case "events":
      return [];
  }
}

// ---- Prices ----

// Per-person dollars where each budget level ends, by kind of place (matches lib/prompt.ts).
const LEVEL_TOPS: Record<"dinner" | "drinks" | "tickets", number[]> = {
  dinner: [30, 60, 100],
  drinks: [25, 45, 75],
  tickets: [20, 50, 100],
};
const GOOGLE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 0,
  PRICE_LEVEL_MODERATE: 1,
  PRICE_LEVEL_EXPENSIVE: 2,
  PRICE_LEVEL_VERY_EXPENSIVE: 3,
};

function kindOf(piece: PieceId) {
  return piece === "dinner" ? "dinner" : piece === "activity" || piece === "events" ? "tickets" : "drinks";
}

function priceOf(p: GooglePlace, piece: PieceId): { level: number | null; text: string } {
  const start = Number(p.priceRange?.startPrice?.units);
  const end = Number(p.priceRange?.endPrice?.units);
  if (Number.isFinite(start) && start > 0) {
    // Google's range is what people typically spend; judge by its middle.
    const mid = Number.isFinite(end) && end > start ? (start + end) / 2 : start * 1.25;
    const tops = LEVEL_TOPS[kindOf(piece)];
    const level = tops.findIndex((t) => mid <= t);
    return {
      level: level === -1 ? 3 : level,
      text: Number.isFinite(end) && end > start ? `$${start}–${end} per person` : `$${start}+ per person`,
    };
  }
  const level = p.priceLevel ? GOOGLE_LEVELS[p.priceLevel] : undefined;
  return { level: level ?? null, text: "" };
}

// ---- Hours ----

function minutesOf(t: Time) {
  return t.day * 1440 + t.hour * 60 + t.minute;
}

/** Whether a place is open at a moment, from Google's weekly periods. Null if Google has no hours. */
function openAt(p: GooglePlace, day: number, minute: number): boolean | null {
  const periods = p.regularOpeningHours?.periods;
  if (!periods?.length) return null;
  const week = 7 * 1440;
  const at = (day * 1440 + minute) % week;
  return periods.some(({ open, close }) => {
    if (!close) return true; // open 24/7
    const o = minutesOf(open);
    let c = minutesOf(close);
    if (c <= o) c += week;
    return (at >= o && at < c) || (at + week >= o && at + week < c);
  });
}

// ---- Candidates for one part of the night ----

/**
 * Real places for one part of the night: operating, well rated, within the
 * budget, open around when they'd go, and inside the area (or close to it).
 */
export async function placesFor(
  piece: PieceId,
  trip: Trip & { otherPieces?: PieceId[] },
  exclude: string[] = [],
): Promise<Candidate[]> {
  const queries = queriesFor(piece, trip);
  if (!queries.length) return [];

  // Planned around a booking: search a short walk (or ride) from it instead of the neighborhood.
  const booked = trip.booked;
  const shape = booked ? null : areaShape(trip.area);
  const center = booked ? { lat: booked.lat, lng: booked.lng } : (await areaContext(trip.area)).center;
  if (!shape && !center) return [];
  const radius = booked ? (trip.rides ? RIDE_RADIUS_MI : BOOKING_WALK_MI) : trip.rides ? RIDE_RADIUS_MI : WALK_RADIUS_MI;
  // Around a booking, look a little wider so there are fallbacks if little is close.
  const box: Box = shape?.box ?? boxAround(center!, booked ? radius * 1.6 : radius);
  const near = booked ? `near ${booked.address || booked.name}` : `in ${trip.area}`;

  const results = (await Promise.all(queries.map((x) => search(`${x.q} ${near}, New York, NY`, box, x.type)))).flat();

  const levels = budgetLevels(trip).map((l) => BUDGETS.indexOf(l));
  const high = Math.max(...levels);
  const date = new Date(`${trip.date}T12:00:00`);
  const target = targetMinutes(piece, trip);
  const skip = new Set([...exclude, ...(booked ? [booked.name] : [])].map((n) => n.trim().toLowerCase()));
  const seen = new Set<string>();

  const out: Candidate[] = [];
  for (const p of results) {
    const name = p.displayName?.text?.trim();
    if (!name || !p.location || seen.has(p.id) || skip.has(name.toLowerCase())) continue;
    seen.add(p.id);
    if (p.businessStatus !== "OPERATIONAL") continue;
    if ((p.rating ?? 0) < MIN_RATING || (p.userRatingCount ?? 0) < MIN_RATINGS) continue;
    const price = priceOf(p, piece);
    if (price.level !== null && price.level > high) continue;
    // Closed at the time they'd arrive (or 30 minutes later, for places opening just after).
    const open = openAt(p, date.getDay(), target) ?? true;
    if (!open && !openAt(p, date.getDay(), target + 30)) continue;

    const point = { lat: p.location.latitude, lng: p.location.longitude };
    // With a real outline, only places inside it count as in the area (630 Hudson St
    // is close to Chelsea's center but in the West Village); otherwise use the radius.
    const miles = center ? milesBetween(center, point) : Infinity;
    const inArea = shape ? shape.contains(point) : miles <= radius;
    out.push(toCandidate(p, piece, date.getDay(), !inArea));
  }
  return out;
}

function toCandidate(p: GooglePlace, piece: PieceId, day: number, far: boolean): Candidate {
  const price = priceOf(p, piece);
  return {
    id: p.id,
    name: p.displayName?.text?.trim() ?? "",
    address: (p.formattedAddress ?? "").replace(/, (USA|United States)$/, ""),
    lat: p.location!.latitude,
    lng: p.location!.longitude,
    type: p.primaryTypeDisplayName?.text ?? "",
    level: price.level,
    priceText: price.text,
    rating: p.rating ?? 0,
    ratings: p.userRatingCount ?? 0,
    url: p.websiteUri ?? "",
    mapsUrl: p.googleMapsUri ?? "",
    reservable: p.reservable ?? null,
    hours: hoursOn(p, day),
    far,
  };
}


// ---- Looking up one place by name ----

const NYC_BOX: Box = { south: 40.49, west: -74.26, north: 40.92, east: -73.68 };

/** Whether Google's name is this venue: most of our words, or all of Google's ("Awash" for "Awash Ethiopian Restaurant"). */
function sameName(ours: string, theirs: string) {
  const a = nameWords(ours);
  const b = nameWords(theirs);
  if (!a.length || !b.length) return false;
  const covered = a.filter((w) => b.includes(w)).length;
  return covered >= Math.ceil((a.length * 2) / 3) || b.every((w) => a.includes(w));
}

/**
 * Google's operating place for a venue Claude suggested, matched by name near
 * its address. Null if Google has no such place (it may be closed or made
 * up); undefined if Google couldn't be asked, so the caller keeps the option.
 */
export async function lookupPlace(name: string, address: string, piece: PieceId, date: string): Promise<Candidate | null | undefined> {
  if (!placesEnabled()) return undefined;
  const results = await search(`${name}, ${address || "New York, NY"}`, NYC_BOX, undefined, 5);
  if (!results.length) return undefined;
  const match = results.find((p) => p.businessStatus === "OPERATIONAL" && p.location && sameName(name, p.displayName?.text ?? ""));
  return match ? toCandidate(match, piece, new Date(`${date}T12:00:00`).getDay(), false) : null;
}

export type VenueMatch = Pick<Candidate, "name" | "address" | "lat" | "lng" | "url" | "mapsUrl" | "type"> & {
  /** Which part of the night this kind of place usually is. */
  piece: PieceId;
};

/** Operating places matching what someone typed, for picking their booking. */
export async function findVenues(query: string): Promise<VenueMatch[]> {
  const results = await search(`${query}, New York, NY`, NYC_BOX, undefined, 6);
  return results
    .filter((p) => p.businessStatus === "OPERATIONAL" && p.location && p.displayName?.text)
    .slice(0, 5)
    .map((p) => {
      const c = toCandidate(p, "dinner", new Date().getDay(), false);
      return { name: c.name, address: c.address, lat: c.lat, lng: c.lng, url: c.url, mapsUrl: c.mapsUrl, type: c.type, piece: pieceForType(p.primaryType ?? "") };
    });
}

function pieceForType(type: string): PieceId {
  if (/night_club/.test(type)) return "dancing";
  if (/bar|pub|wine|brewery|lounge/.test(type)) return "post_drinks";
  if (/restaurant|food|cafe|bistro|steak|diner|eatery/.test(type)) return "dinner";
  return "activity";
}

function boxAround(c: { lat: number; lng: number }, miles: number): Box {
  const dLat = miles / 69;
  const dLng = miles / (69 * Math.cos((c.lat * Math.PI) / 180));
  return { south: c.lat - dLat, north: c.lat + dLat, west: c.lng - dLng, east: c.lng + dLng };
}

/** The night's weekday line from Google, without the day name. */
function hoursOn(p: GooglePlace, day: number) {
  // Google lists Monday first; JavaScript counts from Sunday.
  const line = p.regularOpeningHours?.weekdayDescriptions?.[(day + 6) % 7] ?? "";
  return line.replace(/^[A-Za-z]+:\s*/, "").replace(/ | /g, " ");
}
