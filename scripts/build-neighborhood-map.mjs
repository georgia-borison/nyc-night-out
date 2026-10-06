// Builds public/maps/neighborhoods.json for the tappable area map.
//
// Downloads NYC's official 2020 Neighborhood Tabulation Areas (NTAs) from NYC
// Open Data, keeps only the ones listed in lib/areaNtas.json, simplifies the
// outlines, and writes a small GeoJSON file. Run it again after editing
// lib/areaNtas.json:
//
//   node scripts/build-neighborhood-map.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SOURCE =
  "https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=300&$select=ntaname,the_geom";
const OUT = "public/maps/neighborhoods.json";
const TOLERANCE = 0.00025; // degrees, about 25 m: invisible at neighborhood zoom, much smaller file

const mapping = JSON.parse(readFileSync("lib/areaNtas.json", "utf8"));
const wanted = new Set(
  Object.entries(mapping)
    .filter(([key]) => !key.startsWith("_"))
    .flatMap(([, ntas]) => ntas),
);

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`NYC Open Data returned ${res.status}`);
const source = await res.json();

// Douglas-Peucker line simplification.
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

// 4 decimals is about 10 m, plenty for neighborhood outlines.
const round = ([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4];
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
const simplifyPolygon = (rings) => rings.map((ring) => simplifyRing(ring).map(round));

const features = [];
const found = new Set();
for (const f of source.features) {
  const name = f.properties.ntaname;
  if (!wanted.has(name)) continue;
  found.add(name);
  const g = f.geometry;
  const coordinates =
    g.type === "Polygon"
      ? simplifyPolygon(g.coordinates)
      : g.coordinates
          .map(simplifyPolygon)
          // Drop tiny islands and slivers.
          .filter((poly) => poly[0].length >= 4);
  features.push({ type: "Feature", properties: { nta: name }, geometry: { type: g.type, coordinates } });
}

const missing = [...wanted].filter((n) => !found.has(n));
if (missing.length) throw new Error(`NTAs not found in source data: ${missing.join(", ")}`);

mkdirSync("public/maps", { recursive: true });
const json = JSON.stringify({ type: "FeatureCollection", features });
writeFileSync(OUT, json);
console.log(`Wrote ${OUT}: ${features.length} neighborhoods, ${(json.length / 1024).toFixed(0)} KB`);
