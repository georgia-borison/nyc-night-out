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

// ---- The order with the least walking ----

/** Where each part of the night may go relative to dinner: before, after, or either. */
const PLACE: Record<string, "before" | "after" | "either" | "last"> = {
  pre_drinks: "before",
  dinner: "either",
  activity: "either",
  events: "either",
  post_drinks: "after",
  dancing: "last",
};

type OrderStop = { piece: string; lat?: number; lng?: number };

/** Whether an order makes sense: drinks before dinner first, nightcap after it, dancing last. */
function sensible(order: OrderStop[]) {
  const at = (piece: string) => order.findIndex((s) => s.piece === piece);
  const dinner = at("dinner");
  for (let i = 0; i < order.length; i++) {
    const place = PLACE[order[i].piece] ?? "either";
    if (place === "last" && i !== order.length - 1) return false;
    if (dinner >= 0 && place === "before" && i > dinner) return false;
    if (dinner >= 0 && place === "after" && i < dinner) return false;
  }
  // Pre-dinner drinks lead straight into dinner; a show goes before them or after dinner.
  if (dinner >= 0 && at("pre_drinks") >= 0 && at("pre_drinks") !== dinner - 1) return false;
  // With no dinner, pre-drinks still come before a nightcap.
  const pre = at("pre_drinks");
  const post = at("post_drinks");
  return !(pre >= 0 && post >= 0 && pre > post);
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

/** Straight-line miles walked going through the stops in this order. */
export function routeMiles(order: OrderStop[]) {
  let miles = 0;
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1];
    const b = order[i];
    if (a.lat === undefined || a.lng === undefined || b.lat === undefined || b.lng === undefined) continue;
    miles += milesBetween({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
  }
  return miles;
}

/**
 * The sensible order of a night's stops with the least walking: pre-drinks
 * straight before dinner, a nightcap after, dancing last, and a show or event
 * before the drinks or after dinner, whichever saves the walk. The usual order
 * (drinks, dinner, show, nightcap) wins unless switching saves about 6 minutes
 * on foot. Stops without a location don't add distance.
 */
export function bestOrder<T extends OrderStop>(stops: T[]): { order: T[]; miles: number } {
  // The usual order: drinks, dinner, show, nightcap, dancing.
  const usual = [...stops].sort((a, b) => USUAL.indexOf(a.piece) - USUAL.indexOf(b.piece));
  let best: T[] = usual;
  let bestMiles = sensible(usual) ? routeMiles(usual) : Infinity;
  const usualMiles = bestMiles;
  for (const order of permutations(stops)) {
    if (!sensible(order)) continue;
    const miles = routeMiles(order);
    if (miles < bestMiles - 0.01) {
      best = order;
      bestMiles = miles;
    }
  }
  // Only stray from the usual order when it saves a real walk (~6 minutes).
  if (usualMiles !== Infinity && usualMiles - bestMiles < WORTH_REORDERING_MI) return { order: usual, miles: usualMiles };
  return { order: best, miles: bestMiles === Infinity ? routeMiles(stops) : bestMiles };
}

const USUAL = ["pre_drinks", "dinner", "activity", "events", "post_drinks", "dancing"];
const WORTH_REORDERING_MI = 0.25;
