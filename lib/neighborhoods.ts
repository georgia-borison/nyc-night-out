import areaNtas from "./areaNtas.json";

export type Borough ="Manhattan" | "Brooklyn" | "Queens" | "Bronx" | "Staten Island";

export type Area = {
  name: string;
  lat: number;
  lng: number;
  /** Plain-language boundaries, given to Claude so options stay inside. */
  bounds: string;
  /** Walkable pieces of a sprawling area, shown when rides aren't OK. */
  parts?: Area[];
};

const a = (name: string, lat: number, lng: number, bounds: string, parts?: Area[]): Area => ({
  name, lat, lng, bounds, parts,
});

export const NEIGHBORHOODS: { borough: Borough; areas: Area[] }[] = [
  {
    borough: "Manhattan",
    areas: [
      a("West Village", 40.7358, -74.0036, "Bleecker to 14th St, west of 7th Ave"),
      a("Greenwich Village", 40.7336, -73.999, "Houston to 14th St, 7th Ave to Broadway"),
      a("East Village", 40.7265, -73.9815, "Houston to 14th St, 3rd Ave to Ave D"),
      a("Lower East Side", 40.715, -73.9843, "Canal to Houston St, Bowery to the East River"),
      a("SoHo / Nolita", 40.7233, -73.999, "Canal to Houston St, 6th Ave to the Bowery"),
      a("Chinatown / Two Bridges", 40.7158, -73.997, "around Canal St, Worth St to Division St"),
      a("Tribeca", 40.7163, -74.0086, "Canal to Chambers St, west of Broadway"),
      a("FiDi / Seaport", 40.7075, -74.006, "south of Chambers St to the Battery"),
      a("Chelsea", 40.7465, -74.0014, "14th to 30th St, 6th Ave to the Hudson"),
      a("Meatpacking", 40.7406, -74.0077, "Gansevoort to 16th St, west of 9th Ave"),
      a("Flatiron / NoMad", 40.7431, -73.9897, "14th to 30th St, 6th Ave to Park Ave"),
      a("Gramercy / Union Square", 40.7368, -73.987, "14th to 23rd St, Park Ave to 1st Ave"),
      a("Midtown", 40.7549, -73.984, "30s to 50s, river to river", [
        a("Hell's Kitchen", 40.7638, -73.9918, "W 40s to 50s, 8th Ave to the Hudson"),
        a("Midtown East / Murray Hill", 40.749, -73.978, "E 30s to 50s, 5th Ave to the East River"),
      ]),
      a("Upper West Side", 40.787, -73.9754, "W 59th to 110th St, Central Park West to Riverside Dr", [
        a("UWS · 60s–70s", 40.778, -73.982, "W 59th to 79th St, Central Park West to Riverside Dr"),
        a("UWS · 80s–100s", 40.793, -73.972, "W 80th to 105th St, Central Park West to Riverside Dr"),
        a("Morningside Heights", 40.809, -73.962, "W 105th to 125th St, Morningside Park to Riverside Dr"),
      ]),
      a("Upper East Side", 40.7736, -73.9566, "E 59th to 96th St, 5th Ave to the East River", [
        a("UES · 60s–70s", 40.7685, -73.962, "E 59th to 79th St, 5th Ave to the East River"),
        a("UES · 80s–90s", 40.779, -73.952, "E 80th to 96th St, 5th Ave to the East River"),
      ]),
      a("Harlem", 40.8116, -73.9465, "110th to 155th St", [
        a("Central Harlem", 40.811, -73.947, "110th to 135th St, 5th Ave to St. Nicholas Ave"),
        a("Hamilton Heights / Manhattanville", 40.823, -73.95, "W 125th to 155th St, west of St. Nicholas Ave"),
      ]),
    ],
  },
  {
    borough: "Brooklyn",
    areas: [
      a("Williamsburg", 40.7081, -73.9571, "around Bedford Ave, from the waterfront to Bushwick Ave"),
      a("Greenpoint", 40.7305, -73.9515, "Manhattan Ave and Franklin St, north of McCarren Park"),
      a("Bushwick", 40.6944, -73.9213, "around Jefferson St and Myrtle-Wyckoff"),
      a("Fort Greene / Clinton Hill", 40.6899, -73.9713, "DeKalb Ave and Fulton St, around Fort Greene Park"),
      a("Park Slope", 40.671, -73.9814, "5th and 7th Aves, Flatbush Ave to 15th St"),
      a("Prospect Heights", 40.6775, -73.9692, "Vanderbilt and Washington Aves, north of Eastern Pkwy"),
      a("Carroll Gardens / Cobble Hill", 40.6835, -73.9965, "Court and Smith Sts, Atlantic Ave to 9th St"),
      a("DUMBO / Brooklyn Heights", 40.6983, -73.992, "by the bridges, Henry and Montague Sts"),
      a("Bed-Stuy", 40.6872, -73.9418, "Nostrand to Ralph Aves, Fulton St to Myrtle Ave"),
      a("Crown Heights", 40.6694, -73.9422, "Franklin and Nostrand Aves, along Eastern Pkwy"),
    ],
  },
  {
    borough: "Queens",
    areas: [
      a("Astoria", 40.7644, -73.9235, "Broadway, 30th Ave and Ditmars Blvd, west of Steinway St"),
      a("Long Island City", 40.7447, -73.9485, "Vernon Blvd and Jackson Ave, near Court Sq"),
      a("Jackson Heights", 40.7557, -73.8831, "Roosevelt and 37th Aves, 74th to 90th St"),
      a("Flushing", 40.758, -73.8303, "around Main St and Roosevelt Ave"),
      a("Ridgewood", 40.7043, -73.9056, "Myrtle Ave and Fresh Pond Rd"),
    ],
  },
  {
    borough: "Bronx",
    areas: [
      a("Arthur Avenue / Belmont", 40.855, -73.888, "Arthur Ave and E 187th St"),
      a("Mott Haven", 40.8091, -73.9229, "Bruckner Blvd and E 138th St"),
    ],
  },
];

// Names used by plans saved before the areas were reorganized.
const OLD_NAMES: Record<string, string> = { "Midtown / Hell's Kitchen": "Midtown" };

/** The area chips to show: sprawling areas whole when rides are OK, otherwise their walkable parts. */
export function visibleAreas(rides: boolean) {
  return NEIGHBORHOODS.map((b) => ({
    borough: b.borough,
    areas: b.areas.flatMap((area) => (!rides && area.parts ? area.parts : [area])),
  }));
}

export type AreaInfo = { borough: Borough; lat: number; lng: number; bounds: string; parent?: string; parts?: string[] };

/** Details for a listed area or part, or null for a typed-in one. */
export function areaInfo(name: string): AreaInfo | null {
  const target = OLD_NAMES[name] ?? name;
  for (const b of NEIGHBORHOODS) {
    for (const area of b.areas) {
      if (area.name === target) {
        return { borough: b.borough, lat: area.lat, lng: area.lng, bounds: area.bounds, parts: area.parts?.map((p) => p.name) };
      }
      const part = area.parts?.find((p) => p.name === target);
      if (part) return { borough: b.borough, lat: part.lat, lng: part.lng, bounds: part.bounds, parent: area.name };
    }
  }
  return null;
}

export function isListedArea(name: string) {
  return areaInfo(name) !== null;
}

// Official NYC neighborhood boundaries (NTAs) behind each area, for the map.
const NTAS = areaNtas as unknown as Record<string, string[]>;

/** NTA names that make up an area: its own, or all of its pieces' for a big area. */
export function ntasForArea(name: string): string[] {
  const info = areaInfo(name);
  if (info?.parts) return info.parts.flatMap((p) => NTAS[p] ?? []);
  return NTAS[name] ?? [];
}

/** The area to select when a map shape is tapped: the piece, or its whole neighborhood when rides are on. */
export function areaForNta(nta: string, rides: boolean): string | null {
  const leaf = Object.keys(NTAS).find((k) => !k.startsWith("_") && NTAS[k].includes(nta));
  if (!leaf) return null;
  const parent = areaInfo(leaf)?.parent;
  return rides && parent ? parent : leaf;
}
