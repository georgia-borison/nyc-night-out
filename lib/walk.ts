// Real walking times between stops, from the free OSRM foot router run by
// FOSSGIS on OpenStreetMap data. One request covers every leg of the night.
const OSRM = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";
const USER_AGENT = "NightOutNYC/1.0 (https://nyc-night-out.vercel.app)";
const METERS_PER_MILE = 1609.34;

export type Point = { lat: number; lng: number };
export type Walk = { minutes: number; miles: number; estimated?: boolean };

/** Straight-line distance in miles. */
export function milesBetween(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 7918 * Math.asin(Math.sqrt(h));
}

/** Rough walk when routing is unavailable: grid streets add ~30%, at 3 mph. */
function estimate(a: Point, b: Point): Walk {
  const miles = milesBetween(a, b) * 1.3;
  return { miles: round(miles), minutes: Math.max(1, Math.round((miles / 3) * 60)), estimated: true };
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Adds `walk` (from the previous stop) to every stop where both it and the
 * previous stop have a pin. One routing request per unbroken run of pins.
 */
export async function attachWalks<T extends { lat?: number; lng?: number; walk?: Walk }>(stops: T[]): Promise<T[]> {
  const out = stops.map((s) => {
    const copy = { ...s };
    delete copy.walk;
    return copy;
  });
  let run: number[] = [];
  const flush = async () => {
    if (run.length > 1) {
      const legs = await walkLegs(run.map((i) => ({ lat: out[i].lat!, lng: out[i].lng! })));
      legs.forEach((leg, k) => (out[run[k + 1]].walk = leg));
    }
    run = [];
  };
  for (let i = 0; i < out.length; i++) {
    if (out[i].lat !== undefined && out[i].lng !== undefined) run.push(i);
    else await flush();
  }
  await flush();
  return out;
}

/** Walking legs between consecutive points: result[i] is the walk from points[i] to points[i + 1]. */
export async function walkLegs(points: Point[]): Promise<Walk[]> {
  if (points.length < 2) return [];
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  try {
    const res = await fetch(`${OSRM}/${coords}?overview=false`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as { code?: string; routes?: { legs: { distance: number; duration: number }[] }[] };
    const legs = body.routes?.[0]?.legs;
    if (res.ok && body.code === "Ok" && legs?.length === points.length - 1) {
      return legs.map((l) => ({
        miles: round(l.distance / METERS_PER_MILE),
        minutes: Math.max(1, Math.round(l.duration / 60)),
      }));
    }
  } catch {
    // Fall through to the estimate.
  }
  return points.slice(1).map((p, i) => estimate(points[i], p));
}
