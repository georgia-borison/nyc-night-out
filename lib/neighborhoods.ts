export type Borough = "Manhattan" | "Brooklyn" | "Queens" | "Bronx" | "Staten Island";

export const NEIGHBORHOODS: { borough: Borough; areas: string[] }[] = [
  {
    borough: "Manhattan",
    areas: [
      "West Village",
      "Greenwich Village",
      "East Village",
      "Lower East Side",
      "SoHo / Nolita",
      "Chinatown / Two Bridges",
      "Tribeca",
      "FiDi / Seaport",
      "Chelsea",
      "Meatpacking",
      "Flatiron / NoMad",
      "Gramercy / Union Square",
      "Midtown / Hell's Kitchen",
      "Upper West Side",
      "Upper East Side",
      "Harlem",
    ],
  },
  {
    borough: "Brooklyn",
    areas: [
      "Williamsburg",
      "Greenpoint",
      "Bushwick",
      "Fort Greene / Clinton Hill",
      "Park Slope",
      "Prospect Heights",
      "Carroll Gardens / Cobble Hill",
      "DUMBO / Brooklyn Heights",
      "Bed-Stuy",
      "Crown Heights",
    ],
  },
  {
    borough: "Queens",
    areas: ["Astoria", "Long Island City", "Jackson Heights", "Flushing", "Ridgewood"],
  },
  {
    borough: "Bronx",
    areas: ["Arthur Avenue / Belmont", "Mott Haven"],
  },
];

// Rough center of each listed area, used to sanity-check map pins.
const CENTERS: Record<string, [number, number]> = {
  "West Village": [40.7358, -74.0036],
  "Greenwich Village": [40.7336, -73.999],
  "East Village": [40.7265, -73.9815],
  "Lower East Side": [40.715, -73.9843],
  "SoHo / Nolita": [40.7233, -73.999],
  "Chinatown / Two Bridges": [40.7158, -73.997],
  Tribeca: [40.7163, -74.0086],
  "FiDi / Seaport": [40.7075, -74.006],
  Chelsea: [40.7465, -74.0014],
  Meatpacking: [40.7406, -74.0077],
  "Flatiron / NoMad": [40.7431, -73.9897],
  "Gramercy / Union Square": [40.7368, -73.987],
  "Midtown / Hell's Kitchen": [40.7616, -73.9905],
  "Upper West Side": [40.787, -73.9754],
  "Upper East Side": [40.7736, -73.9566],
  Harlem: [40.8116, -73.9465],
  Williamsburg: [40.7081, -73.9571],
  Greenpoint: [40.7305, -73.9515],
  Bushwick: [40.6944, -73.9213],
  "Fort Greene / Clinton Hill": [40.6899, -73.9713],
  "Park Slope": [40.671, -73.9814],
  "Prospect Heights": [40.6775, -73.9692],
  "Carroll Gardens / Cobble Hill": [40.6835, -73.9965],
  "DUMBO / Brooklyn Heights": [40.6983, -73.992],
  "Bed-Stuy": [40.6872, -73.9418],
  "Crown Heights": [40.6694, -73.9422],
  Astoria: [40.7644, -73.9235],
  "Long Island City": [40.7447, -73.9485],
  "Jackson Heights": [40.7557, -73.8831],
  Flushing: [40.758, -73.8303],
  Ridgewood: [40.7043, -73.9056],
  "Arthur Avenue / Belmont": [40.855, -73.888],
  "Mott Haven": [40.8091, -73.9229],
};

/** Borough and center for one of the listed areas, or null for a typed-in one. */
export function areaInfo(area: string): { borough: Borough; lat: number; lng: number } | null {
  const group = NEIGHBORHOODS.find((b) => b.areas.includes(area));
  const center = CENTERS[area];
  return group && center ? { borough: group.borough, lat: center[0], lng: center[1] } : null;
}
