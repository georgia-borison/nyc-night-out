// Builds public/maps/neighborhoods.json for the tappable area map.
//
// Downloads NYC's official 2020 Neighborhood Tabulation Areas (NTAs) from NYC
// Open Data, merges the NTAs that make up each of our areas into ONE shape
// (so an area has one outline and one name), simplifies the outlines, and
// writes a small GeoJSON file. Run it again after editing lib/areaNtas.json:
//
//   node scripts/build-neighborhood-map.mjs
//
// Each feature has properties { area, mode }: "walk" shapes are shown when
// rides are off (walkable pieces), "ride" when rides are on (whole
// neighborhoods), and "both" for compact areas that look the same either way.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SOURCE =
  "https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=300&$select=ntaname,the_geom";
const OUT = "public/maps/neighborhoods.json";
const TOLERANCE = 0.00025; // degrees, about 25 m: invisible at neighborhood zoom, much smaller file

const { pieces, wholes } = JSON.parse(readFileSync("lib/areaNtas.json", "utf8"));

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`NYC Open Data returned ${res.status}`);
const source = await res.json();
const ntaShapes = new Map(source.features.map((f) => [f.properties.ntaname, f.geometry]));

// ---- Merging: drop the borders that NTAs share, then stitch the rest into rings ----

const key = ([x, y]) => `${x.toFixed(7)},${y.toFixed(7)}`;
const polygonsOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

function signedArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Merge several geometries into one (Multi)Polygon, or null if the edges don't stitch cleanly. */
function dissolve(geometries) {
  // Count each undirected edge; edges seen twice are borders shared between pieces.
  const edges = [];
  const count = new Map();
  for (const g of geometries) {
    for (const poly of polygonsOf(g)) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i];
          const b = ring[i + 1];
          const ka = key(a);
          const kb = key(b);
          if (ka === kb) continue;
          const u = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          count.set(u, (count.get(u) ?? 0) + 1);
          edges.push({ a, b, ka, kb, u });
        }
      }
    }
  }
  const outside = edges.filter((e) => count.get(e.u) === 1);

  // Stitch the remaining edges into closed rings.
  const from = new Map();
  for (const e of outside) {
    if (!from.has(e.ka)) from.set(e.ka, []);
    from.get(e.ka).push(e);
  }
  const used = new Set();
  const rings = [];
  for (const start of outside) {
    if (used.has(start)) continue;
    const ring = [start.a];
    let e = start;
    for (let guard = 0; guard < outside.length + 1; guard++) {
      used.add(e);
      ring.push(e.b);
      if (e.kb === start.ka) break;
      const next = (from.get(e.kb) ?? []).find((n) => !used.has(n));
      if (!next) return null; // a gap: borders didn't line up exactly
      e = next;
    }
    if (key(ring[0]) !== key(ring[ring.length - 1])) return null;
    rings.push(ring);
  }
  if (!rings.length) return null;

  // Bigger rings are outlines; rings inside an outline are holes.
  rings.sort((r1, r2) => Math.abs(signedArea(r2)) - Math.abs(signedArea(r1)));
  const polys = [];
  for (const ring of rings) {
    const host = polys.find((p) => pointInRing(ring[0], p[0]));
    if (host) host.push(ring);
    else polys.push([ring]);
  }
  return polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys };
}

/** Fallback: keep the pieces as separate polygons, but in one feature (one name, one hover target). */
const combine = (geometries) => ({ type: "MultiPolygon", coordinates: geometries.flatMap(polygonsOf) });

// ---- Simplifying (Douglas-Peucker) ----

function simplify(points, tol) {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let max = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = points.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : points;
}

// Rings are closed (first point = last), which breaks the line math above, so
// split each ring at the point farthest from its start and simplify both halves.
function simplifyRing(ring) {
  const open = ring.slice(0, -1);
  if (open.length < 8) return ring;
  const [sx, sy] = open[0];
  let far = 1;
  for (let i = 1; i < open.length; i++) {
    if (Math.hypot(open[i][0] - sx, open[i][1] - sy) > Math.hypot(open[far][0] - sx, open[far][1] - sy)) far = i;
  }
  const first = simplify(open.slice(0, far + 1), TOLERANCE);
  const second = simplify([...open.slice(far), open[0]], TOLERANCE);
  return [...first, ...second.slice(1)];
}

// 4 decimals is about 10 m, plenty for neighborhood outlines.
const round = ([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4];
const simplifyPolygon = (rings) => rings.map((ring) => simplifyRing(ring).map(round));
function simplifyGeometry(g) {
  return g.type === "Polygon"
    ? { type: "Polygon", coordinates: simplifyPolygon(g.coordinates) }
    : {
        type: "MultiPolygon",
        // Drop tiny islands and slivers.
        coordinates: g.coordinates.map(simplifyPolygon).filter((poly) => poly[0].length >= 4),
      };
}

// ---- Build ----

const fallbacks = [];
function shapeFor(area, ntaNames) {
  const missing = ntaNames.filter((n) => !ntaShapes.has(n));
  if (missing.length) throw new Error(`${area}: NTAs not found in source data: ${missing.join(", ")}`);
  const geoms = ntaNames.map((n) => ntaShapes.get(n));
  let merged = geoms.length === 1 ? geoms[0] : dissolve(geoms);
  if (!merged) {
    fallbacks.push(area);
    merged = combine(geoms);
  }
  return simplifyGeometry(merged);
}

const partOf = new Set(Object.values(wholes).flat());
for (const p of partOf) if (!pieces[p]) throw new Error(`wholes lists "${p}", which isn't in pieces`);

const features = [];
for (const [area, ntas] of Object.entries(pieces)) {
  const mode = partOf.has(area) ? "walk" : "both";
  features.push({ type: "Feature", properties: { area, mode }, geometry: shapeFor(area, ntas) });
}
for (const [area, parts] of Object.entries(wholes)) {
  const ntas = parts.flatMap((p) => pieces[p]);
  features.push({ type: "Feature", properties: { area, mode: "ride" }, geometry: shapeFor(area, ntas) });
}

// Every name must be unique in each view of the map.
for (const view of ["walk", "ride"]) {
  const names = features.filter((f) => f.properties.mode === view || f.properties.mode === "both").map((f) => f.properties.area);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) throw new Error(`Duplicate names in the ${view} view: ${[...new Set(dupes)].join(", ")}`);
}

mkdirSync("public/maps", { recursive: true });
const json = JSON.stringify({ type: "FeatureCollection", features });
writeFileSync(OUT, json);
console.log(`Wrote ${OUT}: ${features.length} areas, ${(json.length / 1024).toFixed(0)} KB`);
console.log(fallbacks.length ? `Kept as separate pieces (borders didn't line up): ${fallbacks.join(", ")}` : "All multi-piece areas merged into single outlines.");
