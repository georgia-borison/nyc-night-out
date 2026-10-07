import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import shapes from "../public/maps/neighborhoods.json";

// The same official neighborhood outlines the area map draws, used on the
// server to keep suggestions inside the chosen neighborhood.

type Ring = number[][];
const features = (shapes as unknown as FeatureCollection<Polygon | MultiPolygon, { area: string }>).features;

function polygonsOf(g: Polygon | MultiPolygon): Ring[][] {
  return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
}

function inRing(lng: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export type AreaShape = {
  contains: (p: { lat: number; lng: number }) => boolean;
  /** Bounding box, for limiting searches to the area. */
  box: { south: number; west: number; north: number; east: number };
};

/** The outline of a listed area, or null for areas without one (typed-in areas, Meatpacking). */
export function areaShape(area: string): AreaShape | null {
  const f = features.find((x) => x.properties.area === area);
  if (!f) return null;
  const polys = polygonsOf(f.geometry);
  const points = polys.flatMap((p) => p[0]);
  return {
    contains: ({ lat, lng }) => polys.some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h))),
    box: {
      south: Math.min(...points.map((p) => p[1])),
      north: Math.max(...points.map((p) => p[1])),
      west: Math.min(...points.map((p) => p[0])),
      east: Math.max(...points.map((p) => p[0])),
    },
  };
}

/** The listed area whose outline contains a point, for the walking or the rides view. */
export function areaForPoint(point: { lat: number; lng: number }, rides: boolean): string | null {
  const mode = rides ? "ride" : "walk";
  for (const f of features as unknown as { properties: { area: string; mode: string } }[]) {
    if (f.properties.mode !== "both" && f.properties.mode !== mode) continue;
    if (areaShape(f.properties.area)?.contains(point)) return f.properties.area;
  }
  return null;
}
